export default async function globalSetup() {
  const url = process.env.MMT_URL ?? 'http://localhost:8080';
  try {
    const response = await fetch(`${url}/api/health`);
    if (!response.ok) throw new Error(String(response.status));
  } catch {
    throw new Error(`Map My Thoughts isn't reachable at ${url}. Start it with "npm run up" first.`);
  }
}
