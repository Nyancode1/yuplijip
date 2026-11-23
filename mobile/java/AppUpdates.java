package app.songbook.tj;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.Settings;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.*;
import java.util.regex.*;

final class AppUpdates {
    static final int INSTALL_PERMISSION = 37;
    private final Activity activity;
    private final File apk;
    private static final int MAX_APK = 128 * 1024 * 1024;

    AppUpdates(Activity activity) {
        this.activity = activity;
        apk = new File(activity.getCacheDir(), UpdateFile.NAME);
    }

    private HttpURLConnection connect(String url) throws IOException {
        HttpURLConnection c = (HttpURLConnection)new URL(url).openConnection();
        c.setConnectTimeout(8000);
        c.setReadTimeout(20000);
        c.setRequestProperty("User-Agent", "Yuplijip-Android");
        return c;
    }

    void check() {
        new Thread(() -> {
            try (InputStream config = activity.getAssets().open("update-repository.txt");
                 Scanner scanner = new Scanner(config, "UTF-8").useDelimiter("\\A")) {
                String repo = scanner.next().trim();
                if (!repo.matches("[A-Za-z0-9-]+/[A-Za-z0-9_.-]+")) return;
                HttpURLConnection c = connect("https://api.github.com/repos/" + repo + "/releases/latest");
                JSONObject release;
                try {
                    if (c.getResponseCode() != 200) return;
                    try (Scanner body = new Scanner(c.getInputStream(), "UTF-8").useDelimiter("\\A")) {
                        release = new JSONObject(body.next());
                    }
                } finally { c.disconnect(); }
                String tag = release.getString("tag_name");
                Matcher version = Pattern.compile("^v(\\d+(?:\\.\\d+){1,3})-([1-9]\\d*)$").matcher(tag);
                if (release.optBoolean("draft") || release.optBoolean("prerelease") || !version.matches()) return;
                long code = Long.parseLong(version.group(2));
                PackageInfo installed = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
                if (code <= installed.getLongVersionCode()) return;
                String url = "https://github.com/" + repo + "/releases/download/" + tag + "/yuplijip.apk";
                JSONArray assets = release.getJSONArray("assets");
                for (int i=0; i<assets.length(); i++) {
                    JSONObject asset = assets.getJSONObject(i);
                    if (!url.equals(asset.optString("browser_download_url"))) continue;
                    long size = asset.optLong("size");
                    if (size <= 0 || size > MAX_APK) return;
                    String digest = asset.optString("digest", "");
                    String name = version.group(1);
                    activity.runOnUiThread(() -> {
                        if (activity.isFinishing() || activity.isDestroyed()) return;
                        new AlertDialog.Builder(activity).setTitle("업데이트가 있습니다")
                            .setMessage("유플리집 " + name + " 버전을 설치할 수 있습니다.")
                            .setNegativeButton("나중에", null)
                            .setPositiveButton("업데이트", (d,w) -> download(url, code, size, digest)).show();
                    });
                    return;
                }
            } catch (Exception ignored) { /* 네트워크 없이도 저장된 목록을 연다. */ }
        }).start();
    }

    private boolean validApk(File file, long expectedCode) throws Exception {
        PackageManager pm = activity.getPackageManager();
        PackageInfo installed = pm.getPackageInfo(activity.getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
        PackageInfo candidate = pm.getPackageArchiveInfo(file.getPath(), PackageManager.GET_SIGNING_CERTIFICATES);
        return candidate != null && installed.packageName.equals(candidate.packageName) && candidate.signingInfo != null
            && candidate.getLongVersionCode() > installed.getLongVersionCode()
            && (expectedCode == 0 || candidate.getLongVersionCode() == expectedCode)
            && new HashSet<>(Arrays.asList(installed.signingInfo.getApkContentsSigners())).equals(
               new HashSet<>(Arrays.asList(candidate.signingInfo.getApkContentsSigners())));
    }

    private void download(String url, long code, long total, String digest) {
        Toast.makeText(activity, "업데이트를 내려받는 중입니다.", Toast.LENGTH_SHORT).show();
        new Thread(() -> {
            File temp = null;
            try {
                temp = File.createTempFile("yuplijip-", ".apk", activity.getCacheDir());
                MessageDigest hash = MessageDigest.getInstance("SHA-256");
                long count = 0;
                HttpURLConnection c = connect(url);
                try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(temp)) {
                    byte[] buffer = new byte[32768];
                    for (int n; (n=in.read(buffer)) != -1;) {
                        count += n;
                        if (count > total) throw new IOException();
                        out.write(buffer, 0, n); hash.update(buffer, 0, n);
                    }
                } finally { c.disconnect(); }
                StringBuilder sha = new StringBuilder("sha256:");
                for (byte b : hash.digest()) sha.append(String.format(Locale.ROOT, "%02x", b & 255));
                if (count != total || (digest.startsWith("sha256:") && !digest.equalsIgnoreCase(sha.toString())) ||
                        !validApk(temp, code)) throw new IOException();
                Files.move(temp.toPath(), apk.toPath(), StandardCopyOption.REPLACE_EXISTING);
                activity.runOnUiThread(() -> {
                    if (activity.isFinishing() || activity.isDestroyed()) return;
                    if (activity.getPackageManager().canRequestPackageInstalls()) install();
                    else {
                        try { activity.startActivityForResult(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + activity.getPackageName())), INSTALL_PERMISSION); }
                        catch (RuntimeException e) { failure(); }
                    }
                });
            } catch (Exception e) { activity.runOnUiThread(this::failure); }
            finally { if (temp != null) temp.delete(); }
        }).start();
    }

    void afterPermission() {
        if (activity.getPackageManager().canRequestPackageInstalls()) {
            try { if (validApk(apk, 0)) install(); else failure(); }
            catch (Exception e) { failure(); }
        }
    }

    private void install() {
        try { activity.startActivity(new Intent(Intent.ACTION_VIEW)
            .setDataAndType(UpdateFile.URI, UpdateFile.MIME).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)); }
        catch (RuntimeException e) { failure(); }
    }
    private void failure() {
        if (!activity.isDestroyed()) Toast.makeText(activity, "업데이트를 설치할 수 없습니다. 앱을 다시 열어 시도해 주세요.", Toast.LENGTH_LONG).show();
    }
}
