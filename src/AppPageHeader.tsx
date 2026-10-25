import { BrandWordmark } from './BrandWordmark';
import './app-page-header.css';

type Props={title:string;backHref?:string;onBack?:()=>void;onClose?:()=>void;closeLabel?:string};
function HeaderIcon({close=false}:{close?:boolean}){
  return <svg className="app-page-action-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d={close?'M6 6 18 18 M18 6 6 18':'M16 5 8 12 16 19'} />
  </svg>;
}
export function AppPageHeader({title,backHref,onBack,onClose,closeLabel='닫기'}:Props){
  return <header className="app-page-header" onClick={event=>event.stopPropagation()}>
    <div className="app-page-brand"><BrandWordmark main /></div>
    <div className="app-page-toolbar">
      {backHref?<a href={backHref} aria-label="설정으로 돌아가기"><HeaderIcon /></a>:onBack?<button type="button" aria-label="뒤로" onClick={onBack}><HeaderIcon /></button>:null}
      <h1>{title}</h1>
      {onClose&&<button type="button" className="close-btn" aria-label={closeLabel} onClick={onClose}><HeaderIcon close /></button>}
    </div>
  </header>;
}
