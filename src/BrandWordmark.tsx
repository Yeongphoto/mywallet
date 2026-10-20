export function BrandWordmark({ main = false }: { main?: boolean }) {
  return <><span className={`memoney-wordmark memoney-wordmark-rounded${main ? ' memoney-wordmark-main' : ''}`}>
    {main ? <>
      <span className="memoney-brand-cat" aria-hidden="true"><img src="/images/logo-cat.png" alt="" width="1266" height="1242" /></span>
      <span className="memoney-brand-name"><img src="/images/mememo/memony-wordmark.png" alt="Memoney" width="2170" height="725" /></span>
    </> : <img src="/images/mememo/memoney-wordmark-jelly-v1.png" alt="Memoney" width="2172" height="724" />}
  </span><svg className="memoney-wordmark memoney-wordmark-pixel" viewBox="0 0 1017 149" role="img" aria-label="Memoney">
    <title>Memoney</title>
    <use href="/images/mememo/memoney-wordmark-v2.svg#wordmark" />
  </svg></>;
}
