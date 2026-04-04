import Link from "next/link";

export default function Home() {
  return (
    <div className="home-stack">
      <div>
        <h1 className="home-title">@aurorah/wmcp</h1>
        <p className="home-subtitle">
          Web Module Connection Protocol &mdash; CSR vs SSR binding demo
        </p>
      </div>

      <div className="home-grid">
        <Link href="/ssr" className="home-card home-card-ssr">
          <h2 className="home-card-title">SSR Mode</h2>
          <p className="home-card-desc">
            <strong>host:requires</strong> bound as{" "}
            <strong>server actions</strong>. Persistence runs on the
            server &mdash; no HTTP round-trip for <code>persist:load</code> /
            <code>persist:save</code>.
          </p>
          <code className="home-card-code">
            host.connectDirect(&#123; &quot;persist:load&quot;: serverAction &#125;)
          </code>
        </Link>

        <Link href="/csr" className="home-card home-card-csr">
          <h2 className="home-card-title">CSR Mode</h2>
          <p className="home-card-desc">
            <strong>host:requires</strong> bound as{" "}
            <strong>HTTP adapters</strong>. Each <code>persist:*</code> call
            resolves to a <code>fetch()</code> request to an API route.
          </p>
          <code className="home-card-code">
            host.connect(&#123; &quot;persist:load&quot;: &#123; resolve: ... &#125; &#125;)
          </code>
        </Link>
      </div>

      <div className="home-footer">
        <p>
          Both modes share the <strong>same module</strong> (counter logic) and
          <strong> same manifest</strong>. The module declares{" "}
          <code>module:capabilities</code> it provides and{" "}
          <code>host:requires</code> it needs. The only difference is how the
          host binds those requirements:
        </p>
        <ul>
          <li>
            <strong>Function binding (SSR)</strong> &mdash; the host passes
            server actions directly. wMCP calls them in-process.
          </li>
          <li>
            <strong>Adapter binding (CSR)</strong> &mdash; the host passes an
            object with a <code>resolve()</code> method. wMCP builds an HTTP
            request and uses <code>fetch()</code>.
          </li>
        </ul>
        <p>
          In both cases, the host calls <strong>module:capabilities</strong>
          {" "}via <code>host.call()</code>.
        </p>
      </div>
    </div>
  );
}
