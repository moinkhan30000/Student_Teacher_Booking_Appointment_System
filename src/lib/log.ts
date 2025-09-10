
import { db } from "./firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

type Meta = Record<string, any>;

export async function logEvent(
  uid: string | null,
  action: string,
  meta: Meta = {}
) {
  try {
    await addDoc(collection(db, "logs"), {
      at: serverTimestamp(),
      uid: uid ?? "anon",
      action,
      meta,
    });
  } catch (err) {
    console.warn("[logEvent:fallback]", { uid, action, meta, err });
  }
}
