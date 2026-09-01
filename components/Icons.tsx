/* Shared inline SVG icons. `paths` are raw <path>/<rect> markup strings so the
   same set can seed Supabase `services.icon` later (matches the old content.json). */

export const iconPaths: Record<string, string> = {
  totalrenovering: '<path d="M2 20h20"/><path d="M4 20V8l8-5 8 5v12"/><path d="M9 20v-7h6v7"/>',
  badrumsrenovering:
    '<path d="M4 12h16a1 1 0 0 1 1 1v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-3a1 1 0 0 1 1-1z"/><path d="M6 12V5a2 2 0 0 1 2-2 2 2 0 0 1 2 2"/><path d="M9 5h2"/>',
  koksrenovering:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M7 6h.01M11 6h.01"/>',
  tillbyggnad: '<path d="M3 21h18"/><path d="M5 21V11l5-4 5 4"/><path d="M14 21V8l6-4v17"/>',
  tak: '<path d="m2 12 10-8 10 8"/><path d="M4 10v10h16V10"/><path d="M9 20v-6h6v6"/>',
  golv: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  maleri:
    '<path d="M19 11V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v4h16z"/><path d="M19 7h2v4a2 2 0 0 1-2 2h-6v3"/><rect x="10" y="16" width="4" height="5" rx="1"/>',
  "el-vvs": '<path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/>',
  projektledning:
    '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  house:
    '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/>',
  tools:
    '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  phone:
    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  code: '<path d="m8 6-6 6 6 6"/><path d="m16 6 6 6-6 6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  arrow: '<path d="M5 12h14M13 5l7 7-7 7"/>',
  "arrow-diagonal": '<path d="M7 17 17 7M8 7h9v9"/>',
};

export function Icon({
  name,
  className,
  strokeWidth = 1.7,
}: {
  name: keyof typeof iconPaths | string;
  className?: string;
  strokeWidth?: number;
}) {
  const d = iconPaths[name] ?? iconPaths.house;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: d }}
    />
  );
}
