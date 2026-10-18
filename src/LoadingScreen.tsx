import { LoadingGlyph } from './LoadingGlyph';

// Match the static HTML loader while route, authentication, and data modules load.
export function LoadingScreen({ orbitDelay = '0s' }: { orbitDelay?: string }) {
  return <div className="app-loading-screen" role="status" aria-label="Memoney" aria-live="polite" aria-busy="true">
    <div className="app-loading-mark" aria-hidden="true">
      <span className="app-loading-orbit-track" />
      <span className="app-loading-orbit" style={{ animationDelay: orbitDelay }} />
      <div className="app-loading-logo"><LoadingGlyph /></div>
    </div>
    <div className="app-loading-copy"><h1><span style={{ color: '#ffffff' }}>Me</span><span style={{ marginLeft: '2px' }}>money</span></h1></div>
  </div>;
}
