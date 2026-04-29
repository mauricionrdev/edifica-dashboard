import React from 'react';

function BaseIcon({ children, size = 18, strokeWidth = 1.8, className, ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      {...props}
    >
      {children}
    </svg>
  );
}

export function MenuIcon(props) {
  return <BaseIcon {...props}><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></BaseIcon>;
}
export function CloseIcon(props) {
  return <BaseIcon {...props}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></BaseIcon>;
}
export function CameraIcon(props) {
  return <BaseIcon {...props}><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.4-2h5.2L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" /><circle cx="12" cy="12.5" r="3.5" /></BaseIcon>;
}
export function SearchIcon(props) {
  return <BaseIcon {...props}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></BaseIcon>;
}
export function PlusIcon(props) {
  return <BaseIcon {...props}><path d="M12 5v14" /><path d="M5 12h14" /></BaseIcon>;
}
export function ChevronLeftIcon(props) {
  return <BaseIcon {...props}><path d="m15 18-6-6 6-6" /></BaseIcon>;
}
export function ChevronRightIcon(props) {
  return <BaseIcon {...props}><path d="m9 18 6-6-6-6" /></BaseIcon>;
}
export function ChevronDownIcon(props) {
  return <BaseIcon {...props}><path d="m6 9 6 6 6-6" /></BaseIcon>;
}
export function PanelLeftIcon(props) {
  return <BaseIcon {...props}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /><path d="m13 12 3-3" /><path d="m13 12 3 3" /></BaseIcon>;
}
export function CoinsIcon(props) {
  return <BaseIcon {...props}><circle cx="12" cy="12" r="8" /><path d="M12 8v8" /><path d="M9.5 10.5c0-1 1-1.8 2.5-1.8s2.5.8 2.5 1.8-1 1.8-2.5 1.8-2.5.8-2.5 1.8 1 1.8 2.5 1.8 2.5-.8 2.5-1.8" /></BaseIcon>;
}
export function TargetIcon(props) {
  return <BaseIcon {...props}><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="3.5" /><path d="M12 4v2.2" /><path d="M20 12h-2.2" /><path d="M12 20v-2.2" /><path d="M4 12h2.2" /></BaseIcon>;
}
export function TrendingUpIcon(props) {
  return <BaseIcon {...props}><path d="M4 16l6-6 4 4 6-7" /><path d="M14 7h6v6" /></BaseIcon>;
}
export function LayoutDashboardIcon(props) {
  return <BaseIcon {...props}><rect x="3" y="3" width="7" height="8" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="11" width="7" height="10" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></BaseIcon>;
}
export function HomeIcon(props) {
  return <BaseIcon {...props}><path d="m4 11 8-6 8 6" /><path d="M6.5 10.5V20h11v-9.5" /><path d="M10 20v-5h4v5" /></BaseIcon>;
}
export function BuildingIcon(props) {
  return <BaseIcon {...props}><path d="M4 21h16" /><path d="M7 21V7l5-3 5 3v14" /><path d="M9 11h.01" /><path d="M12 11h.01" /><path d="M15 11h.01" /><path d="M9 15h.01" /><path d="M12 15h.01" /><path d="M15 15h.01" /></BaseIcon>;
}
export function BriefcaseIcon(props) {
  return <BaseIcon {...props}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7" /><path d="M3 12h18" /><path d="M11 11.5h2v2h-2z" /></BaseIcon>;
}
export function UsersIcon(props) {
  return <BaseIcon {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="3" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a3 3 0 0 1 0 5.74" /></BaseIcon>;
}
export function ClipboardListIcon(props) {
  return <BaseIcon {...props}><rect x="8" y="3" width="8" height="4" rx="1.5" /><path d="M9 5H6.5A1.5 1.5 0 0 0 5 6.5v12A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-12A1.5 1.5 0 0 0 17.5 5H15" /><path d="M8 11h8" /><path d="M8 15h5" /></BaseIcon>;
}
export function ChecklistIcon(props) {
  return <BaseIcon {...props}><path d="M9 6h10" /><path d="M9 12h10" /><path d="M9 18h10" /><path d="m4 6 1.5 1.5L7.8 5" /><path d="m4 12 1.5 1.5L7.8 11" /><path d="m4 18 1.5 1.5L7.8 17" /></BaseIcon>;
}
export function CalendarIcon(props) {
  return <BaseIcon {...props}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4" /><path d="M8 3v4" /><path d="M3 10h18" /></BaseIcon>;
}
export function ArrowUpRightIcon(props) {
  return <BaseIcon {...props}><path d="M7 17 17 7" /><path d="M9 7h8v8" /></BaseIcon>;
}
export function LogOutIcon(props) {
  return <BaseIcon {...props}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></BaseIcon>;
}
export function ShieldIcon(props) {
  return <BaseIcon {...props}><path d="M12 3l7 3v6c0 4.5-2.9 7.8-7 9-4.1-1.2-7-4.5-7-9V6l7-3Z" /></BaseIcon>;
}
export function SparklesIcon(props) {
  return <BaseIcon {...props}><path d="m12 3 1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3Z" /><path d="M5 17l.9 2.1L8 20l-2.1.9L5 23l-.9-2.1L2 20l2.1-.9L5 17Z" /><path d="M19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z" /></BaseIcon>;
}
export function ChartColumnIcon(props) {
  return <BaseIcon {...props}><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20V8" /><path d="M2 20h20" /></BaseIcon>;
}
export function BookTemplateIcon(props) {
  return <BaseIcon {...props}><path d="M4.5 5.5A2.5 2.5 0 0 1 7 3h11.5v18H7a2.5 2.5 0 0 0-2.5 2.5" /><path d="M7 3v18" /><path d="M10 7h5" /><path d="M10 11h5" /><path d="M10 15h5" /></BaseIcon>;
}

export function ProjectBoardIcon({ size = 18, className, ...props }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className={className} {...props}>
      <rect x="2" y="2" width="20" height="20" rx="5" fill="#E3C857" />
      <rect x="6.75" y="6.2" width="2.2" height="2.2" rx="0.7" fill="#121316" />
      <rect x="6.75" y="10.9" width="2.2" height="2.2" rx="0.7" fill="#121316" />
      <rect x="6.75" y="15.6" width="2.2" height="2.2" rx="0.7" fill="#121316" />
      <rect x="10.5" y="6.45" width="6.8" height="1.7" rx="0.85" fill="#121316" />
      <rect x="10.5" y="11.15" width="6.8" height="1.7" rx="0.85" fill="#121316" />
      <rect x="10.5" y="15.85" width="6.8" height="1.7" rx="0.85" fill="#121316" />
    </svg>
  );
}
export function TrophyIcon(props) {
  return <BaseIcon {...props}><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" /><path d="M7 6H5a2 2 0 0 0 0 4h2" /><path d="M17 6h2a2 2 0 0 1 0 4h-2" /></BaseIcon>;
}

export function RotateCcwIcon(props) {
  return <BaseIcon {...props}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 3v6h6" /></BaseIcon>;
}
export function SaveIcon(props) {
  return <BaseIcon {...props}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" /><path d="M17 21v-8H7v8" /><path d="M7 3v5h8" /></BaseIcon>;
}
export function TrashIcon(props) {
  return <BaseIcon {...props}><path d="M3 6h18" /><path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6" /><path d="M6.5 6l1 14a2 2 0 0 0 2 1.86h5a2 2 0 0 0 2-1.86l1-14" /><path d="M10 10.5v6" /><path d="M14 10.5v6" /></BaseIcon>;
}

export function MailIcon(props) {
  return <BaseIcon {...props}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></BaseIcon>;
}
export function BellIcon(props) {
  return <BaseIcon {...props}><path d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" /><path d="M10 21a2 2 0 0 0 4 0" /></BaseIcon>;
}
