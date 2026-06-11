import Link from "next/link"

export default function HomePage() {
  return (
    <main className="home-shell">
      <section>
        <p className="eyebrow">Signal Paint</p>
        <h1>Collaborative visualizer MVP</h1>
        <nav>
          <Link href="/stage">Open stage</Link>
          <Link href="/controller">Open controller</Link>
          <Link href="/color-controller">Open color</Link>
          <Link href="/audio-controller">Open audio</Link>
        </nav>
      </section>
    </main>
  )
}
