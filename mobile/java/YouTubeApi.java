package app.songbook.tj;

import android.content.Context;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.webkit.WebResourceResponse;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.Locale;

final class YouTubeApi {
    private final Context app;
    private final String certificate;

    YouTubeApi(Context app) {
        this.app = app;
        try {
            Signature signer = app.getPackageManager().getPackageInfo(app.getPackageName(),
                PackageManager.GET_SIGNING_CERTIFICATES).signingInfo.getApkContentsSigners()[0];
            StringBuilder hex = new StringBuilder();
            for (byte b : MessageDigest.getInstance("SHA-1").digest(signer.toByteArray()))
                hex.append(String.format(Locale.ROOT, "%02X", b & 255));
            certificate = hex.toString();
        } catch (Exception e) { throw new IllegalStateException("Cannot identify APK signer", e); }
    }

    WebResourceResponse request(Uri request) throws IOException {
        String resource = request.getLastPathSegment();
        Uri.Builder uri = Uri.parse("https://www.googleapis.com/youtube/v3/").buildUpon()
            .appendPath(resource).appendQueryParameter("part", "snippet");
        String id = request.getQueryParameter("id");
        if ("videos".equals(resource)) {
            if (id == null || !id.matches("[A-Za-z0-9_-]{11}(,[A-Za-z0-9_-]{11}){0,49}"))
                return response(400, "{\"reason\":\"invalidId\"}");
            uri.appendQueryParameter("id", id).appendQueryParameter("hl", "ja")
                .appendQueryParameter("fields", "items(id,snippet(title,channelTitle,localized/title,description))");
        } else {
            if (id == null || !id.matches("[A-Za-z0-9_-]{2,128}"))
                return response(400, "{\"reason\":\"invalidId\"}");
            if ("playlists".equals(resource)) {
                uri.appendQueryParameter("id", id).appendQueryParameter("fields", "items(snippet/title)");
            } else if ("playlistItems".equals(resource)) {
                uri.appendQueryParameter("playlistId", id).appendQueryParameter("maxResults", "50")
                    .appendQueryParameter("fields", "nextPageToken,items(snippet(title,videoOwnerChannelTitle,resourceId/videoId,thumbnails))");
                String token = request.getQueryParameter("pageToken");
                if (token != null && token.length() <= 4096) uri.appendQueryParameter("pageToken", token);
            } else return response(404, "{}");
        }
        if (YouTubeConfig.KEY.isEmpty()) return response(503, "{\"reason\":\"keyMissing\"}");
        HttpURLConnection connection = (HttpURLConnection)new URL(uri.build().toString()).openConnection();
        try {
            connection.setInstanceFollowRedirects(false);
            connection.setUseCaches(false);
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(18000);
            connection.setRequestProperty("X-Goog-Api-Key", YouTubeConfig.KEY);
            connection.setRequestProperty("X-Android-Package", app.getPackageName());
            connection.setRequestProperty("X-Android-Cert", certificate);
            int status = connection.getResponseCode();
            if (status == 200) return response(200, read(connection.getInputStream()));
            String detail = "";
            try {
                JSONObject error = new JSONObject(read(connection.getErrorStream())).getJSONObject("error");
                detail = error.getJSONArray("errors").getJSONObject(0).optString("reason");
            } catch (Exception ignored) {}
            return response(status >= 400 && status <= 599 ? status : 502,
                "{\"reason\":" + JSONObject.quote(detail) + "}");
        } finally { connection.disconnect(); }
    }

    private static String read(InputStream source) throws IOException {
        if (source == null) return "";
        try (InputStream in = source; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            for (int count; (count = in.read(buffer)) != -1;) {
                if (out.size() + count > 4 * 1024 * 1024) throw new IOException("Response too large");
                out.write(buffer, 0, count);
            }
            return out.toString("UTF-8");
        }
    }

    private static WebResourceResponse response(int code, String body) {
        return new WebResourceResponse("application/json", "UTF-8", code, code == 200 ? "OK" : "Unavailable",
            Collections.singletonMap("Cache-Control", "no-store"), new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
    }
}
