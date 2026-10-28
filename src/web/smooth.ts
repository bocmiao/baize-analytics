import {useAutoAnimate} from '@formkit/auto-animate/react';

/** 列表/面板增删重排的统一过渡（AutoAnimate：约 2.3KB，框架无关） */
export function useSmoothList() {
  return useAutoAnimate<HTMLElement>({
    duration: 220,
    easing: 'ease-out',
    disrespectUserMotionPreference: false,
  });
}

/** 表格行变化（筛选、切范围）时的行过渡 */
export function useSmoothRows() {
  return useAutoAnimate<HTMLTableSectionElement>({
    duration: 180,
    easing: 'ease-out',
    disrespectUserMotionPreference: false,
  });
}
