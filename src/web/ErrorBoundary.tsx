import {Component,type ErrorInfo,type ReactNode} from 'react';
import {language} from './i18n';

interface Props {children:ReactNode;resetKey?:string}
interface State {error?:Error}

/** Keeps one report from blanking the workspace when its render throws. */
export class RouteErrorBoundary extends Component<Props,State>{
 state:State={};
 static getDerivedStateFromError(error:Error):State{return {error};}
 componentDidCatch(error:Error,info:ErrorInfo){console.error(error,info.componentStack);}
 componentDidUpdate(previous:Props){if(previous.resetKey!==this.props.resetKey&&this.state.error)this.setState({error:undefined});}
 render(){
  if(!this.state.error)return this.props.children;
  const en=language()==='en';
  return <section className="panel empty-state"><p className="error" role="alert">{en?'This block did not load.':'这块数据没加载出来'} {this.state.error.message}</p><button type="button" onClick={()=>this.setState({error:undefined})}>{en?'Retry':'重试'}</button></section>;
 }
}
