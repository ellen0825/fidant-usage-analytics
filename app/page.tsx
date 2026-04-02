import UsageStats from "@/components/UsageStats";

export default function Home() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold mb-8 text-white">Usage Analytics</h1>
      {/* x-user-id is injected server-side in a real app; here we pass it as a prop */}
      <UsageStats userId={1} />
    </main>
  );
}
