export function BrandWordmark({ main = false }: { main?: boolean }) {
  return <span className={`memoney-wordmark memoney-wordmark-rounded${main ? ' memoney-wordmark-main' : ''}`}>
    {main ? <>
      <span className="memoney-brand-cat" aria-hidden="true"><img src="/images/mememo/main-cat-smooth-v2-1x.png" srcSet="/images/mememo/main-cat-smooth-v2-2x.png 2x, /images/mememo/main-cat-smooth-v2-3x.png 3x" alt="" width="32" height="25" /></span>
      <span className="memoney-brand-name"><img src="/images/mememo/main-name-smooth-v1-1x.png" srcSet="/images/mememo/main-name-smooth-v1-2x.png 2x, /images/mememo/main-name-smooth-v1-3x.png 3x" alt="Memoney" width="104" height="16" /></span>
    </> : <img src="/images/mememo/memoney-wordmark-jelly-v1.png" alt="Memoney" width="2172" height="724" />}
  </span>;
}
