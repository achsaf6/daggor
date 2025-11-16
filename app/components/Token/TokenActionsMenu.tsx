import { forwardRef, useRef, useState, type ChangeEvent } from "react";

interface TokenActionsMenuProps {
  movementInputId: string;
  movementValue: string;
  onMovementChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  uploadInputId: string;
  onImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  avatarUrl: string | null;
  onClearImage: () => void;
  dropdownScale: number;
}

export const TokenActionsMenu = forwardRef<HTMLDivElement, TokenActionsMenuProps>(
  (
    {
      movementInputId,
      movementValue,
      onMovementChange,
      uploadInputId,
      onImageUpload,
      avatarUrl,
      onClearImage,
      dropdownScale,
    },
    ref
  ) => {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

    const handleAvatarButtonClick = () => {
      console.log("TokenActionsMenu: avatar upload button clicked");
      fileInputRef.current?.click();
      console.log("TokenActionsMenu: completed upload");
    };

    const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];

      if (file) {
        console.log("TokenActionsMenu: image selected", {
          name: file.name,
          size: file.size,
          type: file.type,
        });
        setSelectedFileName(file.name);
      } else {
        console.log("TokenActionsMenu: image selection cleared");
        setSelectedFileName(null);
      }

      onImageUpload(event);
    };

    const handleClearImage = () => {
      console.log("TokenActionsMenu: avatar cleared");
      setSelectedFileName(null);
      onClearImage();
    };

    return (
      <div
        ref={ref}
        className="absolute left-1/2 top-full z-30 mt-2 w-48 rounded-lg border border-white/10 bg-gray-900/95 p-3 text-xs text-gray-100 shadow-2xl backdrop-blur-sm"
        style={{
          transform: `translate(-50%, 0) scale(${dropdownScale})`,
          transformOrigin: "top center",
        }}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <label
            htmlFor={movementInputId}
            className="text-[11px] font-semibold uppercase tracking-wide text-gray-300"
          >
            Movement
          </label>
          <input
            id={movementInputId}
            type="number"
            inputMode="numeric"
            value={movementValue}
            onChange={onMovementChange}
            className="w-20 rounded-md border border-gray-600 bg-gray-800 px-2 py-1 text-sm text-gray-100 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label
            htmlFor={uploadInputId}
            className="text-[11px] font-semibold uppercase tracking-wide text-gray-300"
          >
            Avatar
          </label>
          <input
            ref={fileInputRef}
            id={uploadInputId}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleImageUpload}
          />
          <button
            type="button"
            onClick={handleAvatarButtonClick}
            className="rounded-md border border-gray-600 bg-gray-800 px-3 py-1 text-[11px] font-semibold uppercase text-gray-100 transition hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            Select Image
          </button>
          <span className="text-[11px] text-gray-400">
            {selectedFileName
              ? selectedFileName
              : avatarUrl
                ? "Avatar already set"
                : "No file chosen"}
          </span>
          {avatarUrl && (
            <button
              type="button"
              className="text-left text-[11px] font-medium text-red-400 underline"
              onClick={handleClearImage}
            >
              Remove image
            </button>
          )}
        </div>
      </div>
    );
  }
);

TokenActionsMenu.displayName = "TokenActionsMenu";

