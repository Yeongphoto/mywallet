interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) {
    return new Response(JSON.stringify({ error: "D1 Binding not found" }), { status: 500 });
  }

  try {
    const [txs, asts, plns, cats, sgs] = await Promise.all([
      db.prepare("SELECT * FROM transactions").all(),
      db.prepare("SELECT * FROM assets").all(),
      db.prepare("SELECT * FROM plans").all(),
      db.prepare("SELECT * FROM custom_categories").all(),
      db.prepare("SELECT * FROM settings").all()
    ]);

    // parse settings
    const settingsMap: Record<string, string> = {};
    sgs.results.forEach((row: any) => {
      settingsMap[row.key] = row.value;
    });

    const data = {
      transactions: txs.results || [],
      assets: asts.results || [],
      plans: plns.results || [],
      customExpenseCategories: (cats.results || []).filter((c: any) => c.type === 'expense').map((c: any) => ({ id: c.id, label: c.label })),
      customIncomeCategories: (cats.results || []).filter((c: any) => c.type === 'income').map((c: any) => ({ id: c.id, label: c.label })),
      budget: Number(settingsMap['budget']) || 1000000,
      theme: settingsMap['theme'] || 'light'
    };

    return new Response(JSON.stringify(data), {
      headers: { 
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) {
    return new Response(JSON.stringify({ error: "D1 Binding not found" }), { status: 500 });
  }

  try {
    const body: any = await context.request.json();
    const { transactions, assets, plans, customExpenseCategories, customIncomeCategories, budget, theme } = body;

    const statements: D1PreparedStatement[] = [];

    // Clear old data
    statements.push(db.prepare("DELETE FROM transactions"));
    statements.push(db.prepare("DELETE FROM assets"));
    statements.push(db.prepare("DELETE FROM plans"));
    statements.push(db.prepare("DELETE FROM custom_categories"));
    statements.push(db.prepare("DELETE FROM settings"));

    // Insert transactions
    if (Array.isArray(transactions)) {
      transactions.forEach((t: any) => {
        statements.push(
          db.prepare("INSERT INTO transactions (id, type, date, amount, title, category) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(t.id, t.type, t.date, t.amount, t.title, t.category)
        );
      });
    }

    // Insert assets
    if (Array.isArray(assets)) {
      assets.forEach((a: any) => {
        statements.push(
          db.prepare("INSERT INTO assets (id, category, amount, memo) VALUES (?, ?, ?, ?)")
            .bind(a.id, a.category, a.amount, a.memo)
        );
      });
    }

    // Insert plans
    if (Array.isArray(plans)) {
      plans.forEach((p: any) => {
        statements.push(
          db.prepare("INSERT INTO plans (category, type, plannedAmount) VALUES (?, ?, ?)")
            .bind(p.category, p.type, p.plannedAmount)
        );
      });
    }

    // Insert custom categories
    if (Array.isArray(customExpenseCategories)) {
      customExpenseCategories.forEach((c: any) => {
        statements.push(
          db.prepare("INSERT INTO custom_categories (id, type, label) VALUES (?, 'expense', ?)")
            .bind(c.id, c.label)
        );
      });
    }
    if (Array.isArray(customIncomeCategories)) {
      customIncomeCategories.forEach((c: any) => {
        statements.push(
          db.prepare("INSERT INTO custom_categories (id, type, label) VALUES (?, 'income', ?)")
            .bind(c.id, c.label)
        );
      });
    }

    // Insert settings
    statements.push(db.prepare("INSERT INTO settings (key, value) VALUES ('budget', ?)")
      .bind(String(budget ?? 1000000)));
    statements.push(db.prepare("INSERT INTO settings (key, value) VALUES ('theme', ?)")
      .bind(String(theme ?? 'light')));

    // Batch execute
    await db.batch(statements);

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
