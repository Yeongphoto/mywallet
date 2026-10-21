import { LoadingGlyph } from './LoadingGlyph';
import { WalletConnectionScreen } from './auth/WalletConnectionScreen';

// Match the static HTML loader while route, authentication, and data modules load.
export function LoadingScreen({ orbitDelay = '0s' }: { orbitDelay?: string }) {
  if (document.documentElement.hasAttribute('data-native-mememo')) return <WalletConnectionScreen />;
  return <div className="app-loading-screen" role="status" aria-label="Memoney" aria-live="polite" aria-busy="true">
    <div className="app-loading-mark" aria-hidden="true">
      <span className="app-loading-orbit-track" />
      <span className="app-loading-orbit" style={{ animationDelay: orbitDelay }} />
      <div className="app-loading-logo"><LoadingGlyph /></div>
    </div>
    <div className="app-loading-copy"><h1><span style={{ color: '#ffffff' }}>Me</span><span style={{ marginLeft: '2px' }}>money</span></h1></div>
  </div>;
}
