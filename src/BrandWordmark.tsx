export function BrandWordmark({ main = false }: { main?: boolean }) {
  return <><span className={`memoney-wordmark memoney-wordmark-rounded${main ? ' memoney-wordmark-main' : ''}`}>
    <img src={main ? '/images/mememo/memoney-main-wordmark-v1.png' : '/images/mememo/memoney-wordmark-jelly-v1.png'} alt="Memoney" width="2172" height="724" />
  </span><svg className="memoney-wordmark memoney-wordmark-pixel" viewBox="0 0 1017 149" role="img" aria-label="Memoney">
    <title>Memoney</title>
    <use href="/images/mememo/memoney-wordmark-v2.svg#wordmark" />
  </svg></>;
}
