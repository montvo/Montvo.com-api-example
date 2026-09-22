import type { Metadata } from "next";
import { connection } from "next/server";
import { describeFailure, whoAmI } from "@/lib/montvo";

/*
 * Can this server reach the Montvo API with this key?
 *
 * Calls GET /me from wherever the app is deployed, which is the one place
 * that matters: a request that works from your laptop can still fail from a
 * cloud provider. Shows nothing about the account beyond whether the key
 * works, because this page is public.
 */

export const metadata: Metadata = { title: "Connection check", robots: { index: false } };

export default async function Diagnostics() {
  await connection();

  if (!process.env.MONTVO_SECRET_KEY) {
    return (
      <main>
        <h1>Connection check</h1>
        <section className="card bad">
          <h2>No key</h2>
          <p>
            <code>MONTVO_SECRET_KEY</code> is not set on this server.
          </p>
        </section>
      </main>
    );
  }

  const result = await whoAmI();

  return (
    <main>
      <h1>Connection check</h1>
      {result.ok ? (
        <section className="card ok">
          <h2>Connected. The key works.</h2>
          <p>GET /me answered 200 from this server. Limit: {result.data.key.rate_limit_per_minute} calls a minute.</p>
        </section>
      ) : (
        <section className="card bad">
          <h2>{result.kind === "blocked" ? "Blocked before reaching the API" : result.kind === "network" ? "Unreachable" : `The API answered ${result.status}`}</h2>
          <p>{describeFailure(result)}</p>
        </section>
      )}
      <p>
        <a href="/">Back</a>
      </p>
    </main>
  );
}
