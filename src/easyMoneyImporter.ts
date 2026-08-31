import type { AssetItem, CategoryOption, Transaction, TransactionType } from './types';

type EasyMoneyRow = {
  sourceIndex: number;
  date: string;
  time: string;
  asset: string;
  category: string;
  title: string;
  amount: number;
  flow: string;
};

export type EasyMoneyImportResult = {
  transactions: Transaction[];
  assets: AssetItem[];
  expenseCategories: CategoryOption[];
  incomeCategories: CategoryOption[];
  assetCategories: CategoryOption[];
  summary: {
    sourceRows: number;
    transferPairs: number;
    scheduledTransactions: number;
    openingBalanceTransactions: number;
    warnings: string[];
  };
};

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#7c3aed', '#db2777', '#64748b'];

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      cells.push(value.trim());
      value = '';
    } else {
      value += char;
    }
  }
  cells.push(value.trim());
  return cells;
}

function toId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'asset';
}

function parseDateTime(value: string) {
  const match = value.match(/^(\d{4})\.\s*(\d{2})\.\s*(\d{2})\.\s*(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  return {
    date: `${match[1]}-${match[2]}-${match[3]}`,
    time: `${match[4]}:${match[5]}`,
    timestamp: new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`).getTime(),
  };
}

function isTransferOut(flow: string) {
  return flow === '이체출금' || flow === '이체지출';
}

function isTransferIn(flow: string) {
  return flow === '이체입금';
}

function option(label: string, index: number): CategoryOption {
  return { id: `import-${toId(label)}`, label, color: COLORS[index % COLORS.length] };
}

/** Converts the Korean CSV exported by Money Manager (편한가계부) into MyWallet's single-entry transfer model. */
export function importEasyMoneyCsv(text: string, today = new Date()) : EasyMoneyImportResult {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error('CSV에 거래 데이터가 없습니다.');

  const header = parseCsvLine(lines[0]);
  const indexOf = (name: string, occurrence = 0) => {
    let seen = 0;
    for (let index = 0; index < header.length; index += 1) {
      if (header[index] === name && seen++ === occurrence) return index;
    }
    return -1;
  };
  const dateIndex = indexOf('기간');
  const assetIndex = indexOf('자산');
  const categoryIndex = indexOf('분류');
  const titleIndex = indexOf('내용');
  const amountIndex = indexOf('KRW');
  const flowIndex = indexOf('수입/지출');
  if ([dateIndex, assetIndex, categoryIndex, titleIndex, amountIndex, flowIndex].some((index) => index < 0)) {
    throw new Error('편한가계부 CSV의 필수 열을 찾지 못했습니다.');
  }

  const warnings: string[] = [];
  const rows: EasyMoneyRow[] = [];
  lines.slice(1).forEach((line, sourceIndex) => {
    const cells = parseCsvLine(line);
    const parsed = parseDateTime(cells[dateIndex] || '');
    const amount = Number((cells[amountIndex] || '').replace(/,/g, ''));
    if (!parsed || !Number.isFinite(amount) || !cells[assetIndex] || !cells[flowIndex]) {
      warnings.push(`${sourceIndex + 2}행을 해석하지 못해 제외했습니다.`);
      return;
    }
    rows.push({
      sourceIndex,
      date: parsed.date,
      time: parsed.time,
      asset: cells[assetIndex],
      category: cells[categoryIndex] || '기타',
      title: cells[titleIndex] || '',
      amount,
      flow: cells[flowIndex],
    });
  });

  const assetNames = [...new Set(rows.flatMap((row) => isTransferOut(row.flow) ? [row.asset, row.category] : [row.asset]))];
  const assetIds = new Map(assetNames.map((name, index) => [name, `easy-asset-${index + 1}-${toId(name)}`]));
  const assets = assetNames.map((name) => ({ id: assetIds.get(name)!, category: name, amount: 0, memo: '' }));

  const openingCandidates = new Set<number>();
  const byDay = new Map<string, EasyMoneyRow[]>();
  rows.filter((row) => row.flow === '수입' && row.category === '기타').forEach((row) => {
    const group = byDay.get(row.date) || [];
    group.push(row);
    byDay.set(row.date, group);
  });
  byDay.forEach((group) => {
    const ordered = [...group].sort((a, b) => a.time.localeCompare(b.time));
    if (ordered.length < 5) return;
    const start = ordered[0].time;
    const [hours, minutes] = start.split(':').map(Number);
    const cutoff = (hours * 60) + minutes + 30;
    ordered.filter((row) => {
      const [rowHours, rowMinutes] = row.time.split(':').map(Number);
      return ((rowHours * 60) + rowMinutes) <= cutoff;
    }).forEach((row) => openingCandidates.add(row.sourceIndex));
  });

  const usedTransferRows = new Set<number>();
  const transactions: Transaction[] = [];
  rows.forEach((row) => {
    if (usedTransferRows.has(row.sourceIndex)) return;
    if (isTransferOut(row.flow)) {
      const match = rows.find((candidate) => !usedTransferRows.has(candidate.sourceIndex)
        && isTransferIn(candidate.flow)
        && candidate.date === row.date
        && candidate.time === row.time
        && Math.abs(candidate.amount) === Math.abs(row.amount)
        && candidate.asset === row.category
        && candidate.category === row.asset);
      if (!match) {
        warnings.push(`${row.sourceIndex + 2}행 이체의 입금 쌍을 찾지 못했습니다.`);
        return;
      }
      usedTransferRows.add(row.sourceIndex);
      usedTransferRows.add(match.sourceIndex);
      transactions.push({
        id: `easy-transfer-${row.sourceIndex + 1}`,
        type: 'transfer', date: row.date, time: row.time, amount: Math.abs(row.amount),
        title: row.title || match.title || '자산 이체', category: '자산 이체',
        assetId: assetIds.get(row.asset)!, toAssetId: assetIds.get(row.category)!,
        createdAt: Date.parse(`${row.date}T${row.time}:00`),
      });
      return;
    }
    if (isTransferIn(row.flow)) return;
    const type: TransactionType = row.flow === '수입' ? 'income' : 'expense';
    transactions.push({
      id: `easy-${row.sourceIndex + 1}`,
      type, date: row.date, time: row.time, amount: row.amount,
      title: row.title, category: openingCandidates.has(row.sourceIndex) ? '기초잔액' : row.category,
      assetId: assetIds.get(row.asset)!, createdAt: Date.parse(`${row.date}T${row.time}:00`),
    });
  });

  const sourceExpenseCategories = [...new Set(transactions.filter((transaction) => transaction.type === 'expense').map((transaction) => transaction.category))];
  const sourceIncomeCategories = [
    ...new Set(
      transactions
        .filter((transaction) => transaction.type === 'income' && transaction.category !== '기초잔액' && transaction.category !== '기초 잔액' && !transaction.category?.startsWith('opening-balance'))
        .map((transaction) => transaction.category)
    )
  ];
  const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return {
    transactions,
    assets,
    expenseCategories: sourceExpenseCategories.map(option),
    incomeCategories: sourceIncomeCategories.map(option),
    assetCategories: assetNames.map(option),
    summary: {
      sourceRows: rows.length,
      transferPairs: transactions.filter((transaction) => transaction.type === 'transfer').length,
      scheduledTransactions: transactions.filter((transaction) => transaction.date > todayString).length,
      openingBalanceTransactions: openingCandidates.size,
      warnings,
    },
  };
}
