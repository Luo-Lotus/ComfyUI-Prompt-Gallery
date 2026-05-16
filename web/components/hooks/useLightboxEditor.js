import { useState, useRef, useCallback, useEffect } from '../../lib/hooks.mjs';
import { shufflePixels } from '../../lib/gilbert.mjs';
import { buildImageUrl } from '../../utils.js';
import { showToast } from '../Toast.js';

const MAX_UNDO = 20;

export function useLightboxEditor() {
    const [editMode, setEditMode] = useState(false);
    const [activeTool, setActiveTool] = useState('none');
    const [brushColor, setBrushColor] = useState('#ff0000');
    const [brushSize, setBrushSize] = useState(10);
    const [canvasReady, setCanvasReady] = useState(false);

    const canvasRef = useRef(null);
    const undoStack = useRef([]);
    const isDrawing = useRef(false);
    const lastPoint = useRef(null);
    const currentImage = useRef({ path: null, type: null });

    const getCtx = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        return canvas.getContext('2d');
    }, []);

    const pushUndo = useCallback(() => {
        const ctx = getCtx();
        if (!ctx) return;
        const canvas = canvasRef.current;
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        undoStack.current.push(data);
        if (undoStack.current.length > MAX_UNDO) {
            undoStack.current.shift();
        }
    }, [getCtx]);

    const loadImageToCanvas = useCallback((imagePath, imageType) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const url = buildImageUrl(imagePath, imageType);
        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            setCanvasReady(true);
        };

        img.onerror = () => {
            showToast('加载图片到画布失败', 'error');
            setCanvasReady(false);
        };

        img.src = url;
    }, []);

    const enterEditMode = useCallback((imagePath, imageType) => {
        setEditMode(true);
        setActiveTool('none');
        undoStack.current = [];
        setCanvasReady(false);
        currentImage.current = { path: imagePath, type: imageType };
        requestAnimationFrame(() => {
            loadImageToCanvas(imagePath, imageType);
        });
    }, [loadImageToCanvas]);

    const exitEditMode = useCallback(() => {
        setEditMode(false);
        setActiveTool('none');
        undoStack.current = [];
        setCanvasReady(false);
        currentImage.current = { path: null, type: null };
    }, []);

    const restoreOriginal = useCallback(() => {
        const { path, type } = currentImage.current;
        if (!path) return;
        undoStack.current = [];
        setActiveTool('none');
        loadImageToCanvas(path, type);
    }, [loadImageToCanvas]);

    const handleUndo = useCallback(() => {
        if (undoStack.current.length === 0) return;
        const ctx = getCtx();
        if (!ctx) return;
        const data = undoStack.current.pop();
        ctx.putImageData(data, 0, 0);
    }, [getCtx]);

    const applyObfuscation = useCallback(() => {
        const ctx = getCtx();
        const canvas = canvasRef.current;
        if (!ctx || !canvas) return;
        pushUndo();
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        shufflePixels(imageData, canvas.width, canvas.height, true);
        ctx.putImageData(imageData, 0, 0);
    }, [getCtx, pushUndo]);

    const getCanvasPoint = useCallback((e) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY,
        };
    }, []);

    const drawLine = useCallback((ctx, from, to, color, size) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
    }, []);

    const handleBrushStart = useCallback((e) => {
        if (activeTool !== 'brush') return;
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        pushUndo();
        isDrawing.current = true;
        const point = getCanvasPoint(e);
        if (!point) return;
        lastPoint.current = point;
        const ctx = getCtx();
        if (!ctx) return;
        ctx.fillStyle = brushColor;
        ctx.beginPath();
        ctx.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2);
        ctx.fill();
    }, [activeTool, pushUndo, getCanvasPoint, getCtx, brushColor, brushSize]);

    const handleBrushMove = useCallback((e) => {
        if (!isDrawing.current || activeTool !== 'brush') return;
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        const point = getCanvasPoint(e);
        if (!point || !lastPoint.current) return;
        const ctx = getCtx();
        if (!ctx) return;
        drawLine(ctx, lastPoint.current, point, brushColor, brushSize);
        lastPoint.current = point;
    }, [activeTool, getCanvasPoint, getCtx, drawLine, brushColor, brushSize]);

    const handleBrushEnd = useCallback(() => {
        isDrawing.current = false;
        lastPoint.current = null;
    }, []);

    useEffect(() => {
        if (!editMode) return;
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                handleUndo();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [editMode, handleUndo]);

    return {
        editMode,
        activeTool,
        brushColor,
        brushSize,
        canvasReady,
        canvasRef,
        setActiveTool,
        setBrushColor,
        setBrushSize,
        enterEditMode,
        exitEditMode,
        applyObfuscation,
        restoreOriginal,
        handleUndo,
        handleBrushStart,
        handleBrushMove,
        handleBrushEnd,
    };
}
