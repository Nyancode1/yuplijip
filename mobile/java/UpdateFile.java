package app.songbook.tj;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;

public class UpdateFile extends ContentProvider {
    static final String NAME = "yuplijip-update.apk";
    static final String MIME = "application/vnd.android.package-archive";
    static final Uri URI = Uri.parse("content://app.songbook.tj.updates/" + NAME);

    @Override public boolean onCreate() { return true; }
    @Override public String getType(Uri uri) { return URI.equals(uri) ? MIME : null; }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!URI.equals(uri) || !"r".equals(mode)) throw new FileNotFoundException();
        return ParcelFileDescriptor.open(new File(getContext().getCacheDir(), NAME), ParcelFileDescriptor.MODE_READ_ONLY);
    }
    @Override public Cursor query(Uri uri, String[] projection, String filter, String[] args, String order) {
        if (!URI.equals(uri)) throw new IllegalArgumentException();
        String[] columns = projection == null ? new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE} : projection;
        MatrixCursor cursor = new MatrixCursor(columns);
        MatrixCursor.RowBuilder row = cursor.newRow();
        for (String column : columns) {
            if (OpenableColumns.DISPLAY_NAME.equals(column)) row.add(NAME);
            else if (OpenableColumns.SIZE.equals(column)) row.add(new File(getContext().getCacheDir(), NAME).length());
            else row.add(null);
        }
        return cursor;
    }
    @Override public Uri insert(Uri u, ContentValues v) {throw new UnsupportedOperationException();}
    @Override public int update(Uri u, ContentValues v, String w, String[] a) {throw new UnsupportedOperationException();}
    @Override public int delete(Uri u, String w, String[] a) {throw new UnsupportedOperationException();}
}
