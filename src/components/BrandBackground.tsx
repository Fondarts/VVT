import React from 'react';

// Decorative KISSD brand icons as fixed background layer.
// All icons use currentColor (stroke-only). Colors set via CSS color prop.

interface BgIconProps {
  color: string;
  opacity: number;
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
  size: string;
  rotate?: number;
  children: React.ReactNode;
}

const BgIcon: React.FC<BgIconProps> = ({ color, opacity, top, bottom, left, right, size, rotate = 0, children }) => (
  <div style={{
    position: 'absolute',
    top, bottom, left, right,
    width: size,
    maxWidth: size,
    opacity,
    color,
    transform: rotate ? `rotate(${rotate}deg)` : undefined,
    flexShrink: 0,
  }}>
    {children}
  </div>
);

// SVG wrappers
const Eyes = () => (
  <svg overflow="visible" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1226.28 969.68">
    <ellipse fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" cx="307.58" cy="484.84" rx="301.35" ry="478.62"/>
    <ellipse fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" cx="466.28" cy="484.84" rx="142.65" ry="226.56"/>
    <ellipse fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" cx="918.7" cy="484.84" rx="301.35" ry="478.62"/>
    <ellipse fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" cx="1077.4" cy="484.84" rx="142.65" ry="226.56"/>
  </svg>
);


const Magic = () => (
  <svg overflow="visible" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1341.29 1341.29">
    <line fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" x1="670.65" y1="1341.29" x2="670.65" y2="804.78"/>
    <line fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" x1="335.32" y1="1251.44" x2="603.58" y2="786.81"/>
    <line fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" x1="89.85" y1="1005.97" x2="554.49" y2="737.71"/>
    <line fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" x1="0" y1="670.65" x2="536.52" y2="670.65"/>
    <line fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" x1="89.85" y1="335.33" x2="554.48" y2="603.59"/>
    <line fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" x1="335.32" y1="89.85" x2="603.58" y2="554.49"/>
    <line fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" x1="670.64" y1="0" x2="670.64" y2="536.52"/>
    <line fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" x1="1005.97" y1="89.85" x2="737.71" y2="554.49"/>
    <line fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" x1="1251.44" y1="335.32" x2="786.8" y2="603.58"/>
    <line fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" x1="1341.29" y1="670.65" x2="804.77" y2="670.65"/>
    <line fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" x1="1251.44" y1="1005.97" x2="786.8" y2="737.71"/>
    <line fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" x1="1005.97" y1="1251.44" x2="737.71" y2="786.81"/>
  </svg>
);

const Lips = () => (
  <svg overflow="visible" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1477.2 942.94">
    <path fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" d="M738.6,936.71c355.11.43,666.2-113.53,731.6-479.42,11.78-65.89-111.09-286.89-304.6-396.13-273.58-154.43-427,65.75-427,65.75,0,0-153.42-220.18-427-65.75C118.09,170.4-4.77,391.41,7,457.29c65.4,365.89,376.49,479.85,731.6,479.42"/>
    <path fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" d="M604.72,387.78c37.62-18.27,83.71-29.88,133.88-32.06"/>
    <path fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" d="M159,477.18h181.31c55.07,0,109.39-12.7,158.75-37.11l105.67-52.25"/>
    <path fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" d="M872.48,387.78c-37.62-18.27-83.71-29.88-133.88-32.06"/>
    <path fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" d="M1318.19,477.18h-181.31c-55.07,0-109.39-12.7-158.75-37.11l-105.67-52.25"/>
    <path fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" d="M872.48,566.58c-37.62,18.27-83.71,29.88-133.88,32.06"/>
    <path fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" d="M1318.19,477.18h-181.31c-55.07,0-109.39,12.7-158.75,37.11l-105.67,52.25"/>
    <path fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" d="M604.72,566.58c37.62,18.27,83.71,29.88,133.88,32.06"/>
    <path fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" d="M159,477.18h181.31c55.07,0,109.39,12.7,158.75,37.11l105.67,52.25"/>
  </svg>
);

const Fangs = () => (
  <svg overflow="visible" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1477.2 942.94">
    <path fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" d="M740.69,593.33c-54.89,1.45-109.87-.55-164.5-6-126.67-12.63-251.6-43.85-368.78-93.71,126.6-124.75,306.46-203.26,484.66-218.99,26.96-2.38,54.09-2.38,81.05,0,178.2,15.72,358.06,94.24,484.66,218.99-117.18,49.86-242.11,81.09-368.78,93.71-54.63,5.45-109.61,7.44-164.5,6"/>
    <path fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" d="M738.6,936.71c355.11.43,666.2-113.53,731.6-479.42,11.78-65.89-111.09-286.89-304.6-396.13-273.58-154.43-427,65.75-427,65.75,0,0-153.42-220.18-427-65.75C118.09,170.4-4.77,391.41,7,457.29c65.4,365.89,376.49,479.85,731.6,479.42"/>
    <polyline fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" points="367.16 384.15 529.24 506.51 584.16 297.69"/>
    <polyline fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" points="1098.01 384.15 935.93 506.51 881.01 297.69"/>
  </svg>
);

const Robot = () => (
  <svg overflow="visible" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1330.49 1353.74">
    <rect fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" x="6.22" y="402.26" width="1318.04" height="945.26" rx="114.54" ry="114.54"/>
    <rect fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" x="424.58" y="6.22" width="481.33" height="235.53" rx="117.77" ry="117.77"/>
    <rect fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" x="799" y="579.82" width="318.08" height="178.13" rx="89.06" ry="89.06"/>
    <rect fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" x="213.41" y="579.82" width="318.08" height="178.13" rx="89.06" ry="89.06"/>
    <line fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" x1="449.65" y1="911.18" x2="449.65" y2="1140.52"/>
    <line fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" x1="880.84" y1="911.18" x2="880.84" y2="1140.52"/>
    <line fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" x1="662.92" y1="911.18" x2="662.92" y2="1140.52"/>
    <line fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" x1="665.25" y1="241.76" x2="665.25" y2="402.81"/>
    <rect fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="1" vectorEffect="non-scaling-stroke" x="286.18" y="904.99" width="758.13" height="235.53" rx="117.77" ry="117.77"/>
  </svg>
);


export const BrandBackground: React.FC = () => (
  <div
    aria-hidden="true"
    style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}
  >
    {/* EYES — top-left, lime */}
    <BgIcon color="#E1FF1C" opacity={0.22} top="-2%" left="-9%" size="22vw" rotate={-11}>
      <Eyes />
    </BgIcon>

    {/* MAGIC — top-right */}
    <BgIcon color="#E1FF1C" opacity={0.17} top="-11%" right="-3%" size="20vw" rotate={8}>
      <Magic />
    </BgIcon>

    {/* LIPS — center center */}
    <BgIcon color="#E1FF1C" opacity={0.20} top="calc(50% - 4vw)" left="calc(50% - 10vw)" size="17vw" rotate={-7}>
      <Lips />
    </BgIcon>

    {/* ROBOT — bottom-left */}
    <BgIcon color="#E1FF1C" opacity={0.19} bottom="-6%" left="1%" size="16vw" rotate={13}>
      <Robot />
    </BgIcon>

    {/* FANGS — bottom-right */}
    <BgIcon color="#E1FF1C" opacity={0.15} bottom="-2%" right="-7%" size="20vw" rotate={-5}>
      <Fangs />
    </BgIcon>
  </div>
);
