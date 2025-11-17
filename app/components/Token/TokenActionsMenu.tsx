import { forwardRef, useEffect, useRef, useState } from "react";
import { useCharacter } from "@/app/providers/CharacterProvider";

interface TokenActionsMenuProps {
  movementInputId: string;
  movementValue: string;
  onMovementChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  dropdownScale: number;
  onImageUpload?: (file: File) => Promise<string | null>;
  isUploading?: boolean;
}

export const TokenActionsMenu = forwardRef<HTMLDivElement, TokenActionsMenuProps>(
  (
    {
      movementInputId,
      movementValue,
      onMovementChange,
      dropdownScale,
      onImageUpload,
      isUploading = false,
    },
    ref
  ) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [movementInput, setMovementInput] = useState<string>(movementValue);
    const [movementLocalError, setMovementLocalError] = useState<string | null>(null);
    const [uploadStatus, setUploadStatus] = useState<string | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const isUpdatingFromInputRef = useRef(false);
    const {
      character,
      hasSelectedCharacter,
      updateCharacter,
      updateError,
      isUpdating,
    } = useCharacter();

    const storedMovementString =
      hasSelectedCharacter && character?.movementSpeed !== null && character?.movementSpeed !== undefined
        ? String(character.movementSpeed)
        : "";

    useEffect(() => {
      // Don't reset the input if we're currently updating from user input
      if (isUpdatingFromInputRef.current) {
        return;
      }
      if (hasSelectedCharacter) {
        setMovementInput(storedMovementString);
      } else {
        setMovementInput(movementValue);
      }
    }, [hasSelectedCharacter, storedMovementString, movementValue]);

    useEffect(() => {
      if (!hasSelectedCharacter || typeof window === "undefined") {
        return;
      }

      if (movementInput === storedMovementString) {
        setMovementLocalError(null);
        isUpdatingFromInputRef.current = false;
        return;
      }

      isUpdatingFromInputRef.current = true;

      const timer = window.setTimeout(() => {
        const trimmed = movementInput.trim();
        if (!trimmed) {
          setMovementLocalError(null);
          void updateCharacter({ movementSpeed: null }).then(() => {
            isUpdatingFromInputRef.current = false;
          });
          return;
        }

        const parsed = Number(trimmed);
        if (Number.isNaN(parsed)) {
          setMovementLocalError("Movement must be a valid number.");
          isUpdatingFromInputRef.current = false;
          return;
        }

        setMovementLocalError(null);
        void updateCharacter({ movementSpeed: parsed }).then(() => {
          isUpdatingFromInputRef.current = false;
        });
      }, 600);

      return () => window.clearTimeout(timer);
    }, [hasSelectedCharacter, movementInput, storedMovementString, updateCharacter]);

    useEffect(() => {
      if (!hasSelectedCharacter) {
        setMovementLocalError(null);
      }
    }, [hasSelectedCharacter]);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      console.log("File selected:", file, "onImageUpload:", onImageUpload);
      setUploadStatus(null);
      setUploadError(null);
      if (file && onImageUpload) {
        try {
          console.log("Calling onImageUpload with file:", file.name);
          const uploadedUrl = await onImageUpload(file);
          console.log("Upload completed successfully");
          setUploadStatus("Token art updated.");
          if (uploadedUrl && hasSelectedCharacter) {
            await updateCharacter({ tokenImageUrl: uploadedUrl });
            setUploadStatus("Token art synced to Supabase.");
          } else if (!hasSelectedCharacter) {
            setUploadStatus("Sync your name to store art in Supabase.");
          }
        } catch (error) {
          console.error("Failed to upload image:", error);
          setUploadError(
            error instanceof Error ? error.message : "Failed to upload token art."
          );
        } finally {
          // Reset the input so the same file can be selected again
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }
      } else {
        console.warn("File or onImageUpload missing:", { file: !!file, onImageUpload: !!onImageUpload });
      }
    };

    const handleUploadClick = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("Upload button clicked, fileInputRef:", fileInputRef.current);
      // Use setTimeout to ensure the click happens after event propagation
      setTimeout(() => {
        if (fileInputRef.current) {
          fileInputRef.current.click();
          console.log("File input clicked");
        } else {
          console.error("File input ref is null");
        }
      }, 0);
    };

    return (
      <div
        ref={ref}
        className="absolute left-1/2 top-full z-30 mt-2 w-48 rounded-lg border border-white/10 bg-gray-900/95 p-3 text-xs text-gray-100 shadow-2xl backdrop-blur-sm"
        style={{
          transform: `translate(-50%, 0) scale(${dropdownScale})`,
          transformOrigin: "top center",
        }}
        onClick={(e) => {
          // Prevent clicks inside the menu from closing it
          e.stopPropagation();
        }}
      >
        <div className="flex flex-col gap-3">
          <div className="rounded-md border border-gray-700/60 bg-gray-800/80 px-2 py-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Character
            </p>
            <p className="text-xs text-white">
              {hasSelectedCharacter && character
                ? character.name
                : "Set via mobile loading screen"}
            </p>
          </div>
          <div className="flex items-center justify-between gap-2">
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
              value={movementInput}
              onChange={(event) => {
                const { value } = event.target;
                setMovementInput(value);
                onMovementChange(event);
              }}
              disabled={!hasSelectedCharacter}
              placeholder={hasSelectedCharacter ? "0" : "Set name first"}
              className="w-20 rounded-md border border-gray-600 bg-gray-800 px-2 py-1 text-sm text-gray-100 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          {!hasSelectedCharacter && (
            <p className="text-[10px] text-amber-200/80">
              Enter your name on the mobile loading screen to save this stat to Supabase.
            </p>
          )}
          {(movementLocalError || updateError) && (
            <p className="text-[10px] text-red-300">
              {movementLocalError ?? updateError}
            </p>
          )}
          {isUpdating && hasSelectedCharacter && (
            <p className="text-[10px] text-indigo-200/80">Syncing with Supabase...</p>
          )}
          <div className="flex flex-col gap-2">
            <label
              className="text-[11px] font-semibold uppercase tracking-wide text-gray-300"
            >
              Image
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={handleUploadClick}
              disabled={isUploading}
              className="w-full rounded-md border border-gray-600 bg-gray-800 px-2 py-1.5 text-xs text-gray-100 transition-colors hover:bg-gray-700 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? "Uploading..." : "Upload Image"}
            </button>
            {hasSelectedCharacter ? (
              <p className="text-[10px] text-gray-300/80">
                Stored as <code className="font-mono text-[10px]">characters.{character?.name}</code>
              </p>
            ) : (
              <p className="text-[10px] text-amber-200/80">
                We&apos;ll keep the art on your token, but set your name to persist it in Supabase.
              </p>
            )}
            {uploadStatus && !uploadError && (
              <p className="text-[10px] text-emerald-200/80">{uploadStatus}</p>
            )}
            {uploadError && (
              <p className="text-[10px] text-red-300">{uploadError}</p>
            )}
          </div>
        </div>
      </div>
    );
  }
);

TokenActionsMenu.displayName = "TokenActionsMenu";

