import { FileSpreadsheet, Layers, LayoutDashboard, Radio, Settings, Users, type LucideIcon } from 'lucide-react'

export interface NavItem {
  /** Absolute path. */
  to: string
  label: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/results', label: 'Results', icon: Users },
  { to: '/admin/import', label: 'Import', icon: FileSpreadsheet },
  { to: '/admin/tiers', label: 'Prize tiers', icon: Layers },
  { to: '/admin/live', label: 'Live control', icon: Radio },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
]

export function navItemFor(pathname: string): NavItem {
  const path = pathname.replace(/\/+$/, '') || '/admin'
  return NAV_ITEMS.find((n) => n.to !== '/admin' && path.startsWith(n.to)) ?? NAV_ITEMS[0]
}
