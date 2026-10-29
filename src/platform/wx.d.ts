/**
 * 微信小游戏全局对象的最小类型声明。
 * 仅声明本项目用到的 API，避免引入额外类型包。
 */
declare const wx: any;
declare function requestAnimationFrame(cb: () => void): number;
declare function cancelAnimationFrame(id: number): void;
