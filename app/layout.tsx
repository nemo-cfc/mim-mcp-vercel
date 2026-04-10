export const metadata = {
  title: 'MiM Essay MCP Server',
  description: 'Remote MCP server for MiM Essay CRM analytics',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
