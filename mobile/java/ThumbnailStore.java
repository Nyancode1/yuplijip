package app.songbook.tj;

import android.graphics.BitmapFactory;
import android.webkit.WebResourceResponse;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.Locale;

final class ThumbnailStore {
    private static final int MAX_BYTES = 8 * 1024 * 1024;
    private final File directory;
    private final Object[] locks = new Object[32];

    ThumbnailStore(File files) {
        directory = new File(files, "song-thumbnails");
        for (int i = 0; i < locks.length; i++) locks[i] = new Object();
    }

    private static boolean allowed(URL url) {
        String host = url.getHost().toLowerCase(Locale.ROOT);
        return "https".equals(url.getProtocol()) && url.getUserInfo() == null
            && (url.getPort() == -1 || url.getPort() == 443)
            && (host.endsWith(".ytimg.com") || host.endsWith(".googleusercontent.com") || host.endsWith(".ggpht.com"));
    }

    WebResourceResponse open(String address) throws Exception {
        if (address == null || address.length() > 8192) throw new IOException("Invalid image address");
        URL url = new URL(address);
        if (!allowed(url)) throw new IOException("Unsupported image host");
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(address.getBytes(StandardCharsets.UTF_8));
        StringBuilder name = new StringBuilder();
        for (byte b : digest) name.append(String.format(Locale.ROOT, "%02x", b & 255));
        File target = new File(directory, name.toString());
        synchronized (locks[(digest[0] & 255) % locks.length]) {
            String mime = imageType(target);
            if (mime == null) {
                if (!directory.isDirectory() && !directory.mkdirs() && !directory.isDirectory()) throw new IOException();
                File temporary = File.createTempFile("incoming-", ".tmp", directory);
                try {
                    download(url, temporary);
                    mime = imageType(temporary);
                    if (mime == null) throw new IOException("Invalid thumbnail");
                    Files.move(temporary.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
                } finally { temporary.delete(); }
            }
            return new WebResourceResponse(mime, null, new FileInputStream(target));
        }
    }

    private static String imageType(File file) {
        if (!file.isFile()) return null;
        BitmapFactory.Options info = new BitmapFactory.Options();
        info.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(file.getPath(), info);
        return info.outWidth > 0 && info.outHeight > 0 && info.outMimeType != null &&
            info.outMimeType.startsWith("image/") ? info.outMimeType : null;
    }

    private static void download(URL url, File target) throws IOException {
        for (int redirects = 0; redirects <= 3; redirects++) {
            if (!allowed(url)) throw new IOException("Unsupported redirect");
            HttpURLConnection c = (HttpURLConnection)url.openConnection();
            try {
                c.setInstanceFollowRedirects(false);
                c.setConnectTimeout(6000);
                c.setReadTimeout(12000);
                c.setRequestProperty("Accept", "image/*");
                int status = c.getResponseCode();
                if (status >= 300 && status <= 399) {
                    String location = c.getHeaderField("Location");
                    if (location == null) throw new IOException();
                    url = new URL(url, location);
                    continue;
                }
                if (status != 200 || c.getContentLengthLong() > MAX_BYTES) throw new IOException("Image unavailable");
                try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(target)) {
                    byte[] buffer = new byte[16384];
                    int total = 0;
                    for (int n; (n = in.read(buffer)) != -1;) {
                        total += n;
                        if (total > MAX_BYTES) throw new IOException("Image too large");
                        out.write(buffer, 0, n);
                    }
                    if (total == 0 || (c.getContentLengthLong() >= 0 && total != c.getContentLengthLong())) throw new EOFException();
                }
                return;
            } finally { c.disconnect(); }
        }
        throw new IOException("Too many redirects");
    }
}
