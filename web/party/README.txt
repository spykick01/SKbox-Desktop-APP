SKParty web page: lets friends join your voice party from a browser, no SKBox needed.

Put this whole "party" folder next to your site's index.html (Netlify: drag it into the deploy together with the rest of the site).
Then the page is at  https://sksmpchat.netlify.app/party/  and invite links look like  https://sksmpchat.netlify.app/party/#KQ7M2X

- If your site has a catch-all rule in _redirects like "/* /index.html 200", leave it. A real file wins over that rule.
- The page uses the free PeerJS service for the handshake. Voices go straight between friends.
- It needs https (Netlify gives you that) and a browser that allows the microphone.
- Use headphones, or everyone will hear echo.
