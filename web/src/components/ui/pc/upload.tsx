import { CheckCircle2, FileUp, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { useId, useRef, useState, type DragEvent, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import "./pc-ui.css";

export type UploadFieldProps = HTMLAttributes<HTMLDivElement> & {
    label: ReactNode;
    description?: ReactNode;
    error?: ReactNode;
    required?: boolean;
};

export function UploadField({ label, description, error, required = false, className, children, ...props }: UploadFieldProps) {
    const generatedId = useId();
    const labelId = `${generatedId}-label`;
    const descriptionId = description || error ? `${generatedId}-description` : undefined;

    return (
        <div className={cn("pc-upload-field", error && "has-error", className)} role="group" aria-labelledby={labelId} aria-describedby={descriptionId} {...props}>
            <div className="pc-upload-field__label-row">
                <span id={labelId} className="pc-upload-field__label">
                    {label}
                    {required ? (
                        <span className="pc-upload-field__required" aria-label="必填">
                            *
                        </span>
                    ) : null}
                </span>
                {description ? <span className="pc-upload-field__hint">{description}</span> : null}
            </div>
            <div className="pc-upload-field__control">{children}</div>
            {error ? (
                <div id={descriptionId} className="pc-upload-field__error" role="alert">
                    <TriangleAlert aria-hidden="true" />
                    <span>{error}</span>
                </div>
            ) : description ? (
                <span id={descriptionId} className="pc-upload-field__sr-description">
                    {description}
                </span>
            ) : null}
        </div>
    );
}

export type FileDropzoneProps = Omit<HTMLAttributes<HTMLDivElement>, "children" | "onDrop"> & {
    label?: ReactNode;
    description?: ReactNode;
    icon?: ReactNode;
    accept?: string;
    multiple?: boolean;
    disabled?: boolean;
    onFiles: (files: File[]) => void;
};

export function FileDropzone({ label = "拖放文件到这里，或点击选择", description, icon, accept, multiple = false, disabled = false, onFiles, className, ...props }: FileDropzoneProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const descriptionId = useId();
    const [dragging, setDragging] = useState(false);

    const emitFiles = (files: FileList | null) => {
        if (disabled || !files?.length) return;
        onFiles(Array.from(files));
    };

    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDragging(false);
        emitFiles(event.dataTransfer.files);
    };

    return (
        <div
            {...props}
            className={cn("pc-file-dropzone", dragging && "is-dragging", disabled && "is-disabled", className)}
            onDragEnter={(event) => {
                event.preventDefault();
                if (!disabled) setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
                const relatedTarget = event.relatedTarget;
                if (!(relatedTarget instanceof Node) || !event.currentTarget.contains(relatedTarget)) setDragging(false);
            }}
            onDrop={handleDrop}
        >
            <input
                ref={inputRef}
                className="pc-file-dropzone__input"
                type="file"
                accept={accept}
                multiple={multiple}
                disabled={disabled}
                tabIndex={-1}
                aria-hidden="true"
                onChange={(event) => {
                    emitFiles(event.currentTarget.files);
                    event.currentTarget.value = "";
                }}
            />
            <button type="button" className="pc-file-dropzone__trigger" disabled={disabled} aria-describedby={description ? descriptionId : undefined} onClick={() => inputRef.current?.click()}>
                <span className="pc-file-dropzone__icon" aria-hidden="true">
                    {icon || <FileUp />}
                </span>
                <span className="pc-file-dropzone__label">{label}</span>
                {description ? (
                    <span id={descriptionId} className="pc-file-dropzone__description">
                        {description}
                    </span>
                ) : null}
            </button>
        </div>
    );
}

export type UploadProgressStatus = "pending" | "uploading" | "success" | "error";

export type UploadProgressProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
    name: ReactNode;
    progress?: number;
    status?: UploadProgressStatus;
    detail?: ReactNode;
    onRetry?: () => void;
    onRemove?: () => void;
    retryLabel?: string;
    removeLabel?: string;
};

const STATUS_LABELS: Record<UploadProgressStatus, string> = {
    pending: "等待上传",
    uploading: "正在上传",
    success: "上传完成",
    error: "上传失败",
};

export function UploadProgress({ name, progress = 0, status = "uploading", detail, onRetry, onRemove, retryLabel = "重试上传", removeLabel = "移除文件", className, ...props }: UploadProgressProps) {
    const safeProgress = Math.min(100, Math.max(0, progress));
    const showProgress = status === "pending" || status === "uploading" || status === "success";

    return (
        <div className={cn("pc-upload-progress", `pc-upload-progress--${status}`, className)} role="status" aria-live="polite" {...props}>
            <div className="pc-upload-progress__icon" aria-hidden="true">
                {status === "success" ? <CheckCircle2 /> : status === "error" ? <TriangleAlert /> : <FileUp />}
            </div>
            <div className="pc-upload-progress__content">
                <div className="pc-upload-progress__topline">
                    <span className="pc-upload-progress__name">{name}</span>
                    <span className="pc-upload-progress__status">
                        {STATUS_LABELS[status]}
                        {status === "uploading" ? ` ${Math.round(safeProgress)}%` : ""}
                    </span>
                </div>
                {showProgress ? <progress className="pc-upload-progress__bar" max={100} value={status === "success" ? 100 : safeProgress} aria-label={`${STATUS_LABELS[status]} ${Math.round(status === "success" ? 100 : safeProgress)}%`} /> : null}
                {detail ? <div className="pc-upload-progress__detail">{detail}</div> : null}
            </div>
            {onRetry || onRemove ? (
                <div className="pc-upload-progress__actions">
                    {status === "error" && onRetry ? (
                        <button type="button" className="pc-upload-progress__action" aria-label={retryLabel} onClick={onRetry}>
                            <RefreshCw aria-hidden="true" />
                        </button>
                    ) : null}
                    {onRemove ? (
                        <button type="button" className="pc-upload-progress__action" aria-label={removeLabel} onClick={onRemove}>
                            <Trash2 aria-hidden="true" />
                        </button>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
