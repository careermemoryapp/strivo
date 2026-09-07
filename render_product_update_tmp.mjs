// Scratch script used once to render a preview of the Product Updates drip
// email (see src/lib/emailProductUpdate.ts) to hand-check before wiring it
// live. Not imported by anything, not part of the app -- left here only
// because this folder doesn't allow file deletion. Safe to ignore/remove
// manually later.
import { renderProductUpdateEmailHtml } from "./src/lib/emailProductUpdate.ts";
import fs from "fs";

const sampleContentHtml = `
<p>Most people don't recognize their own wins in the moment -- a tricky bug fixed at 11pm, a teammate talked off the ledge before a launch, a client call that could have gone sideways but didn't. You mention it in passing. Strivo used to just record it like anything else.</p>
<h2>What's new</h2>
<p>Strivo now reads every memory you save and asks a second question: does this sound bigger than the person telling it thinks it is? If the answer is yes, it gets a quiet flag -- <strong>Underplayed Win</strong> -- and shows up in a dedicated spot so you can revisit it later, whether that's for a resume line, a performance review, or just to notice the pattern in yourself.</p>
<ul>
<li>Works automatically on every new memory, voice or text</li>
<li>No extra step on your end -- nothing to tag or mark yourself</li>
<li>Shows up as a callout on Home so you don't have to go digging for it</li>
</ul>
<h2>Why we built this</h2>
<p>The whole point of Strivo is to remember things you'd otherwise forget you did. The most common way people undersell themselves isn't lying -- it's just describing a real accomplishment so casually that even they stop noticing it's one. This closes that gap.</p>
<blockquote>"I told Strivo about a client escalation I handled and it came back and said 'this sounds like it prevented a churn.' I hadn't thought about it that way until it pointed it out." -- an early user</blockquote>
<p>Try it next time you record something that felt routine -- you might be underselling it too.</p>
`.trim();

fs.writeFileSync(
  "/sessions/vibrant-elegant-carson/mnt/outputs/product_update_email_preview.html",
  renderProductUpdateEmailHtml({
    firstName: "Shikhar",
    postTitle: "Strivo now catches the wins you talk yourself out of",
    postExcerpt:
      "we shipped a new feature that notices when you're underselling something you just recorded, even if you brushed past it in a sentence.",
    postContentHtml: sampleContentHtml,
    postUrl: "https://strivo.ai/blog/strivo-now-catches-the-wins-you-talk-yourself-out-of",
    unsubscribeUrl: "https://strivo.ai/api/email/unsubscribe?t=preview",
  })
);
console.log("done");
