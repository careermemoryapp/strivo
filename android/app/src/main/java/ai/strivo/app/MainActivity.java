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

        handleAuthCallbackIntent(getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleAuthCallbackIntent(intent);
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
