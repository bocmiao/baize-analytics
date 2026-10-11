import type {FactHydration} from './selected-fact-hydration.js';
/** Experimental query projection; complete remains the production default. */
export function statsFactHydration():FactHydration{return process.env.BAIZE_SELECTED_FACT_HYDRATION==='1'?'selected':'complete';}
