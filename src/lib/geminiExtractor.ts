import { supabase } from "../supabase";

export async function extractDueDateFromPdf(file: File): Promise<string | null> {
  try {
    const fileBase64 = await fileToBase64(file);
    const { data, error } = await supabase.functions.invoke("ai-document-extract", {
      body: {
        mode: "due-date",
        fileBase64,
        mimeType: file.type || "application/pdf",
      },
    });

    if (error) throw error;
    return typeof data?.dueDate === "string" ? data.dueDate : null;
  } catch (error) {
    console.error("Error extracting due date:", error);
    return null;
  }
}

export async function parseItauStatement(text: string): Promise<any[]> {
  try {
    const { data, error } = await supabase.functions.invoke("ai-document-extract", {
      body: {
        mode: "itau-statement",
        text,
      },
    });

    if (error) throw error;
    return Array.isArray(data?.transactions) ? data.transactions : [];
  } catch (error) {
    console.error("Error parsing Itau statement:", error);
    return [];
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
}
