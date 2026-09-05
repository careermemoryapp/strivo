package ai.strivo.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Google Sign-In (via NextAuth) sets a short-lived "state" cookie
        // before redirecting to accounts.google.com, then reads it back
        // when Google redirects to strivo.ai/api/auth/callback/google to
        // verify the round trip. Android's WebView blocks third-party
        // cookies by default, which silently drops that cookie during the
        // redirect and causes NextAuth to fail with
        // "OAuthCallbackError: State cookie was missing." Explicitly
        // enabling third-party cookies on this app's WebView fixes it.
        WebView webView = this.bridge.getWebView();
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        // On a cold start (app process wasn't already running when the
        // ai.strivo.app://auth-callback deep link arrived -- the common case
        // right after a multi-second Google account picker/2FA round trip in
        // the system browser, which is exactly when Android is most likely
        // to have killed the backgrounded app to reclaim memory), calling
        // handleAuthCallbackIntent() synchronously here means its
        // webView.loadUrl(consumeUrl) call races against the WebView load
        // that super.onCreate() (Capacitor's BridgeActivity) just kicked off
        // for the app's normal server.url. Whichever load "wins" that race
        // was timing-dependent -- explaining why sign-in worked on some
        // attempts and silently landed back on /login on others. Posting
        // this to the WebView's own message queue instead of calling it
        // immediately lets Capacitor's initial load get dispatched first, so
        // this one reliably runs after it and wins every time instead of
        // sometimes.
        webView.post(() -> handleAuthCallbackIntent(getIntent()));
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleAuthCallbackIntent(intent);
    }

    @Override
    public void onPause() {
        super.onPause();

        // Android's WebView doesn't write cookie changes to disk right away
        // -- it batches them and flushes periodically. Log Out (signOut() in
        // settings/page.tsx) clears the session cookie the moment it runs,
        // but that deletion only lives in memory until the next flush. If
        // this app's process gets killed while backgrounded -- which is
        // completely normal, and especially likely in the few seconds right
        // after someone logs out and immediately closes the app -- the
        // deletion never makes it to disk. The next cold start then reads
        // the *old*, still-valid session cookie back off disk, and the
        // person who just logged out finds themselves silently signed back
        // in without ever seeing the Google sign-in screen. Flushing here,
        // every time the app leaves the foreground (not just on logout --
        // there's no cheap way to hook "right after logout" specifically
        // from native code), closes that window for logout and for every
        // other cookie change alike.
        CookieManager.getInstance().flush();
    }

    // Google also blocks its own sign-in *screen* inside embedded WebViews
    // (separately from the cookie issue above) — the "Continue" button just
    // renders disabled there. So Google sign-in for this app runs in the
    // system browser instead (see login/page.tsx), and lands back here via
    // the ai.strivo.app://auth-callback deep link registered in
    // AndroidManifest.xml, carrying a short-lived one-time token. We load
    // that token into /api/auth/mobile-consume inside this app's own
    // WebView, which is what exchanges it for a real session cookie in the
    // cookie jar this app actually reads from.
    private void handleAuthCallbackIntent(Intent intent) {
        if (intent == null) return;
        Uri uri = intent.getData();
        if (uri == null) return;
        if (!"auth-callback".equals(uri.getHost())) return;
        String token = uri.getQueryParameter("token");
        if (token == null || token.isEmpty()) return;
        String consumeUrl = "https://strivo.ai/api/auth/mobile-consume?token=" + Uri.encode(token);
        WebView webView = this.bridge.getWebView();
        webView.loadUrl(consumeUrl);
    }
}
