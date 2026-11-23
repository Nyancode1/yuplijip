package app.songbook.tj;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.*;
import android.widget.Toast;
import java.io.*;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private WebView view;
    private AppUpdates updates;
    private ThumbnailStore thumbnails;
    private YouTubeApi youtube;
    private static final int PICK_FILE = 41;
    private ValueCallback<Uri[]> fileResult;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        thumbnails = new ThumbnailStore(getFilesDir());
        youtube = new YouTubeApi(this);
        getWindow().setStatusBarColor(0xff121214);
        getWindow().setNavigationBarColor(0xff121214);
        view = new WebView(this);
        view.setBackgroundColor(0xff121214);
        view.getSettings().setJavaScriptEnabled(true);
        view.getSettings().setDomStorageEnabled(true);
        view.getSettings().setAllowFileAccess(false);
        view.getSettings().setAllowContentAccess(false);
        view.addJavascriptInterface(new Object() {
            @JavascriptInterface public void copyNumber(String number) {
                if (number == null || !number.matches("[0-9]{1,8}")) return;
                runOnUiThread(() -> {
                    ClipboardManager cm = (ClipboardManager)getSystemService(CLIPBOARD_SERVICE);
                    cm.setPrimaryClip(ClipData.newPlainText("TJ 곡번호", number));
                    Toast.makeText(MainActivity.this, "TJ 번호를 복사했습니다", Toast.LENGTH_SHORT).show();
                });
            }
        }, "Songbook");
        view.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                String address = req.getUrl().toString();
                if (req.isForMainFrame() && req.hasGesture() && (
                    address.equals("https://www.youtube.com/t/terms") || address.equals("https://policies.google.com/privacy") ||
                    address.equals("https://github.com/Nyancode1/yuplijip/issues") ||
                    address.equals("https://vocadb.net/") ||
                    address.equals("https://github.com/Nyancode1/yuplijip/blob/main/docs/NOTICES.md"))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, req.getUrl())); }
                    catch (ActivityNotFoundException ignored) {}
                }
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!"https".equals(u.getScheme()) || !HOST.equals(u.getHost())) {
                    return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", null,
                        new ByteArrayInputStream(new byte[0]));
                }
                try {
                    if (u.getPath().startsWith("/youtube/") && "GET".equals(req.getMethod())) return youtube.request(u);
                    if ("/thumbnail".equals(u.getPath())) return thumbnails.open(u.getQueryParameter("url"));
                    String name = u.getPath().substring(1);
                    if (name.contains("..") || name.isEmpty()) throw new IOException("잘못된 경로");
                    String type = name.endsWith(".html") ? "text/html" : name.endsWith(".js") ? "application/javascript" :
                        name.endsWith(".css") ? "text/css" : name.endsWith(".json") ? "application/json" :
                        name.endsWith(".jpeg") ? "image/jpeg" : name.endsWith(".png") ? "image/png" :
                        name.endsWith(".webp") ? "image/webp" : "application/octet-stream";
                    return new WebResourceResponse(type, type.startsWith("image/") || type.endsWith("octet-stream") ? null : "UTF-8", getAssets().open(name));
                } catch (Exception e) {
                    return new WebResourceResponse("text/plain", "UTF-8", 502, "Unavailable", null,
                        new ByteArrayInputStream("요청한 정보를 읽지 못했습니다.".getBytes(StandardCharsets.UTF_8)));
                }
            }
        });
        view.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileResult != null) fileResult.onReceiveValue(null);
                fileResult = callback;
                Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE);
                boolean image = java.util.Arrays.asList(params.getAcceptTypes()).contains("image/*");
                pick.setType(image ? "image/*" : "*/*");
                pick.putExtra(Intent.EXTRA_LOCAL_ONLY, true);
                try { startActivityForResult(pick, PICK_FILE); }
                catch (ActivityNotFoundException e) { fileResult = null; callback.onReceiveValue(null); }
                return true;
            }
        });
        setContentView(view);
        view.loadUrl("https://" + HOST + "/index.html");
        updates = new AppUpdates(this);
        updates.check();
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_FILE && fileResult != null) {
            Uri picked = result == RESULT_OK && data != null ? data.getData() : null;
            fileResult.onReceiveValue(picked != null && "content".equals(picked.getScheme()) ? new Uri[]{picked} : null);
            fileResult = null;
        }
        if (request == AppUpdates.INSTALL_PERMISSION && updates != null) updates.afterPermission();
    }

    @Override public void onBackPressed() {
        view.evaluateJavascript("window.handleBack ? window.handleBack() : false", value -> {
            if (!"true".equals(value)) finish();
        });
    }
}
