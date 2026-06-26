"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

export function ControllerNav() {
  const pathname = usePathname()

  return (
    <nav className="controller-nav" aria-label="Controller pages">
      <Link href="/controller" data-active={pathname === "/controller"}>
        Draw
      </Link>
      <Link
        href="/color-controller"
        data-active={pathname === "/color-controller"}
      >
        Color
      </Link>
      <Link
        href="/audio-controller"
        data-active={pathname.startsWith("/audio-controller")}
      >
        Audio
      </Link>
      <Link href="/songs" data-active={pathname === "/songs"}>
        Songs
      </Link>
      <Link href="/wled" data-active={pathname === "/wled"}>
        WLED
      </Link>
      <Link href="/stage" data-active={pathname === "/stage"}>
        Stage
      </Link>
    </nav>
  )
}
