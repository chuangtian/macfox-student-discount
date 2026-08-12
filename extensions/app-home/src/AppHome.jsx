import {render} from 'preact';

export default async () => {
  render(<App />, document.body);
};

function App() {
  return (
    <s-page heading="Student discount">
      <s-section heading="Theme module">
        <s-stack direction="block" gap="base">
          <s-text>
            Add the Student discount app block in the Shopify theme editor. You can drag it to any supported position, show or hide it, and choose text or an image.
          </s-text>
          <s-text>
            Open Online Store, select Customize, open a product template, choose Add block, then select Student discount from Apps.
          </s-text>
        </s-stack>
      </s-section>
      <s-section heading="Student verification">
        <s-text>
          Educational email requests are processed automatically. Student ID submissions continue to use the connected decomkt-ads review workflow.
        </s-text>
      </s-section>
    </s-page>
  );
}
