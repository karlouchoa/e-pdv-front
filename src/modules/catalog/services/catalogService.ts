import {
  Category,
  Product,
  ProductPayload,
  SessionData,
} from "@/modules/core/types";
import { sessionRequest } from "@/modules/core/services/apiClient";

const PRODUCTS_ENDPOINT = "/T_ITENS";
const CATEGORIES_ENDPOINT = "/T_GRITENS";

const buildQueryPath = (
  basePath: string,
  query?: Record<string, string>,
) => {
  if (!query || Object.keys(query).length === 0) {
    return basePath;
  }
  const search = new URLSearchParams(query);
  return `${basePath}?${search.toString()}`;
};

export async function listProducts(session: SessionData) {
  return sessionRequest<Product[]>(session, {
    path: buildQueryPath(PRODUCTS_ENDPOINT, { tabela: "T_ITENS" }),
    method: "GET",
  });
}

export async function listCategories(session: SessionData) {
  return sessionRequest<Category[]>(session, {
    path: CATEGORIES_ENDPOINT,
    method: "GET",
  });
}

export interface ItemSavePayload extends ProductPayload {
  id?: string | null;
  isComposed: boolean;
  isRawMaterial: boolean;
  itprodsn?: "S" | "N";
  matprima?: "S" | "N";
  notes?: string;
  imagePath?: string;
}

const mapItemToApiPayload = (payload: ItemSavePayload) => ({
  cditem: payload.sku,
  deitem: payload.name,
  unid: payload.unit,
  undven: payload.unit,
  cdgru: payload.category,
  itprodsn: payload.isComposed ? "S" : " ",
  matprima: payload.isRawMaterial ? "S" : " ",
  barcodeit: payload.barcode ?? "",
  clasfis: payload.ncm ?? "",
  cest: payload.cest ?? "",
  codcst: payload.cst ?? "",
  preco: payload.salePrice ?? 0,
  custo: payload.costPrice ?? 0,
  leadtime: payload.leadTimeDays ?? 0,
  obsitem: payload.notes ?? "",
  locfotitem: payload.imagePath ?? "",
});

export async function saveItem(
  session: SessionData,
  payload: ItemSavePayload,
) {
  const apiPayload = mapItemToApiPayload(payload);
  const hasId = Boolean(payload.id);
  const path = hasId
    ? `${PRODUCTS_ENDPOINT}/${payload.id}`
    : PRODUCTS_ENDPOINT;

  return sessionRequest<Product>(session, {
    path,
    method: hasId ? "PATCH" : "POST",
    data: apiPayload,
  });
}
