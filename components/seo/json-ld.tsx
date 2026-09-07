/**
 * Emits JSON-LD for the page. Rendered on the server; `<` is escaped so a
 * description can never close the script early.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  const graph = Array.isArray(data) ? data : [data];
  return (
    <>
      {graph.map((node, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(node).replace(/</g, "\\u003c"),
          }}
        />
      ))}
    </>
  );
}
