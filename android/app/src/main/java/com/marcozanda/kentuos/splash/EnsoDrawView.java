package com.marcozanda.kentuos.splash;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PathMeasure;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Xfermode;
import android.util.AttributeSet;
import android.view.View;

import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.PathParser;

import com.marcozanda.kentuos.R;

/**
 * Rivela l'Enso/C con un unico gesto lungo il tracciato esterno.
 * Il fill finale è il path originale (nessuna modifica al design).
 */
public class EnsoDrawView extends View {

    private static final float VIEWPORT = 512f;
    private static final float BRUSH_WIDTH = 108f;

    private final Path ensoFillPath = new Path();
    private final Path drawGuidePath = new Path();
    private final Path segmentPath = new Path();
    private final Path maskPath = new Path();
    private final PathMeasure pathMeasure = new PathMeasure();
    private final Paint fillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint brushPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint maskPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Xfermode dstIn = new PorterDuffXfermode(PorterDuff.Mode.DST_IN);

    private float revealProgress;
    private boolean pathsReady;

    public EnsoDrawView(Context context) {
        super(context);
        init(context);
    }

    public EnsoDrawView(Context context, @Nullable AttributeSet attrs) {
        super(context, attrs);
        init(context);
    }

    public EnsoDrawView(Context context, @Nullable AttributeSet attrs, int defStyleAttr) {
        super(context, attrs, defStyleAttr);
        init(context);
    }

    private void init(Context context) {
        setWillNotDraw(false);
        fillPaint.setStyle(Paint.Style.FILL);
        fillPaint.setColor(ContextCompat.getColor(context, R.color.kentu_enso_blue));

        brushPaint.setStyle(Paint.Style.STROKE);
        brushPaint.setStrokeWidth(BRUSH_WIDTH);
        brushPaint.setStrokeCap(Paint.Cap.ROUND);
        brushPaint.setStrokeJoin(Paint.Join.ROUND);

        maskPaint.setStyle(Paint.Style.FILL);
        maskPaint.setColor(0xFFFFFFFF);
        maskPaint.setXfermode(dstIn);

        Path fill = PathParser.createPathFromPathData(
                context.getString(R.string.kentu_enso_path));
        Path guide = PathParser.createPathFromPathData(
                context.getString(R.string.kentu_enso_draw_path));
        if (fill != null) {
            ensoFillPath.set(fill);
        }
        if (guide != null) {
            drawGuidePath.set(guide);
            pathMeasure.setPath(drawGuidePath, false);
            pathsReady = pathMeasure.getLength() > 0f;
        }
    }

    public float getRevealProgress() {
        return revealProgress;
    }

    public void setRevealProgress(float revealProgress) {
        float clamped = revealProgress < 0f ? 0f : Math.min(1f, revealProgress);
        if (this.revealProgress == clamped) {
            return;
        }
        this.revealProgress = clamped;
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (!pathsReady || revealProgress <= 0f || getWidth() == 0 || getHeight() == 0) {
            return;
        }

        float size = Math.min(getWidth(), getHeight());
        float scale = size / VIEWPORT;
        float dx = (getWidth() - size) / 2f;
        float dy = (getHeight() - size) / 2f;

        canvas.save();
        canvas.translate(dx, dy);
        canvas.scale(scale, scale);

        if (revealProgress >= 1f) {
            canvas.drawPath(ensoFillPath, fillPaint);
            canvas.restore();
            return;
        }

        float length = pathMeasure.getLength() * revealProgress;
        segmentPath.rewind();
        pathMeasure.getSegment(0f, Math.max(length, 0.5f), segmentPath, true);

        maskPath.rewind();
        brushPaint.getFillPath(segmentPath, maskPath);

        int layer = canvas.saveLayer(0f, 0f, VIEWPORT, VIEWPORT, null);
        canvas.drawPath(ensoFillPath, fillPaint);
        canvas.drawPath(maskPath, maskPaint);
        canvas.restoreToCount(layer);
        canvas.restore();
    }
}
