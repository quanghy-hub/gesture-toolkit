# Privacy Tab Answers

This file is a conservative draft for the Chrome Web Store `Privacy practices` tab based on the current store build. It should stay aligned with:

- `manifest.json`
- `content/bootstrap.js`
- `shared/config.js`
- `privacy-policy.md`
- `permissions-justification.md`

Official references:

- [Fill out the privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Set up your developer account](https://developer.chrome.com/docs/webstore/set-up-account)

## Single purpose description

Recommended text:

`Gesture Toolkit helps users browse faster with three connected tools: web gestures, clipboard history, and quick search shortcuts for selected text or images.`

## Permissions justification

Use `permissions-justification.md`.

## Remote code use

Recommended answer:

- `No, I am not using remote code.`

Reason:

- The current store package does not load or execute remotely hosted JavaScript files.

## Data usage

Conservative recommendation:

- Treat this extension as handling user data because it processes selected text, clipboard history, image URLs, and web-page interaction context locally.
- Keep all dashboard disclosures, privacy policy wording, and actual runtime behavior strictly consistent.

Recommended disclosure summary:

- Stores settings locally in the browser
- Stores clipboard history locally in the browser
- Does not send browsing data or page content to developer-owned servers in this build
- Opens user-requested search URLs in new tabs
- Quick Search may request provider favicon images from provider domains for UI display

## Limited Use certification

Recommended answer:

- Certify compliance only if the final uploaded build still matches the current runtime scope and does not transmit personal or sensitive user data to developer-controlled services.

Reasoned basis from current code:

- Current runtime features are limited to gestures, clipboard, and quick search
- No developer-owned backend is contacted by the store build
- Remote translation/OCR services are not part of the packaged store ZIP

## Privacy policy URL

Required before publishing:

- Publish `privacy-policy.md` at a public HTTPS URL
- Use the same claims in the dashboard and the public policy

## Developer account fields

Required before publishing:

- Verified contact email: `victus59.3@gmail.com`
- Physical address if you offer paid features or purchases
- Support website or public support page URL: `https://quanghy-hub.github.io/donate/?source=extension`

The physical address requirement is called out by Chrome for items that offer purchases, additional features, or subscriptions.
