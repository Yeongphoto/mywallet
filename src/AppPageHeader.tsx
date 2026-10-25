import { BrandWordmark } from './BrandWordmark';
import './app-page-header.css';

type Props={title:string;backHref?:string;onBack?:()=>void;onClose?:()=>void;closeLabel?:string};
export function AppPageHeader({title,backHref,onBack,onClose,closeLabel='닫기'}:Props){
  return <header className="app-page-header" onClick={event=>event.stopPropagation()}>
    <div className="app-page-brand"><BrandWordmark main /></div>
    <div className="app-page-toolbar">
      {backHref?<a href={backHref} aria-label="설정으로 돌아가기">‹</a>:onBack?<button type="button" aria-label="뒤로" onClick={onBack}>‹</button>:null}
      <h1>{title}</h1>
      {onClose&&<button type="button" className="close-btn" aria-label={closeLabel} onClick={onClose}>×</button>}
    </div>
  </header>;
}
