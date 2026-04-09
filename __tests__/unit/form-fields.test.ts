import { describe, it, expect } from "vitest";
import {
  FIELD_POOL,
  CATEGORY_LABELS,
  DB_COLUMN_FIELDS,
  EXTRA_FIELDS,
  FIXED_FIELD_KEYS,
  DEFAULT_CUSTOM_FIELDS,
  getFieldDef,
  isKanaField,
  getKanaFieldKey,
  isCustomField,
  customFieldToPoolItem,
} from "@/lib/form-fields";
import type { FieldCategory } from "@/lib/form-fields";
import type { CustomFieldDef } from "@/lib/types";

// ──────────────────────────────────────────────
// FIELD_POOL 定数
// ──────────────────────────────────────────────

describe("FIELD_POOL", () => {
  it("should contain all expected keys", () => {
    const keys = FIELD_POOL.map((f) => f.key);
    expect(keys).toContain("full_name");
    expect(keys).toContain("kana");
    expect(keys).toContain("age");
    expect(keys).toContain("sex");
    expect(keys).toContain("birthday");
    expect(keys).toContain("prefecture");
    expect(keys).toContain("phone");
    expect(keys).toContain("email");
    expect(keys).toContain("organization");
    expect(keys).toContain("organization_kana");
    expect(keys).toContain("branch");
    expect(keys).toContain("branch_kana");
    expect(keys).toContain("martial_arts_experience");
    expect(keys).toContain("memo");
    expect(keys).toContain("rule_preference");
    expect(keys).toContain("height");
    expect(keys).toContain("weight");
    expect(keys).toContain("grade");
  });

  it("should have unique keys", () => {
    const keys = FIELD_POOL.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("should have valid categories for all items", () => {
    const validCategories: FieldCategory[] = ["basic", "affiliation", "competition", "equipment"];
    for (const field of FIELD_POOL) {
      expect(validCategories).toContain(field.category);
    }
  });

  it("should have valid field types", () => {
    const validTypes = ["text", "textarea", "number", "tel", "email", "date", "radio", "checkbox", "select"];
    for (const field of FIELD_POOL) {
      expect(validTypes).toContain(field.type);
    }
  });

  it("prefecture field should have 47 fixedChoices", () => {
    const pref = FIELD_POOL.find((f) => f.key === "prefecture");
    expect(pref).toBeDefined();
    expect(pref?.fixedChoices).toHaveLength(47);
    expect(pref?.fixedChoices?.[0]).toEqual({ label: "北海道", value: "北海道" });
    expect(pref?.fixedChoices?.[46]).toEqual({ label: "沖縄県", value: "沖縄県" });
  });

  it("sex field should have male/female choices", () => {
    const sex = FIELD_POOL.find((f) => f.key === "sex");
    expect(sex).toBeDefined();
    expect(sex?.defaultChoices).toEqual([
      { label: "男性", value: "male" },
      { label: "女性", value: "female" },
    ]);
  });

  it("email field should have hasConfirmInput set to true", () => {
    const email = FIELD_POOL.find((f) => f.key === "email");
    expect(email).toBeDefined();
    expect(email?.hasConfirmInput).toBe(true);
  });

  it("organization field should use dojos master", () => {
    const org = FIELD_POOL.find((f) => f.key === "organization");
    expect(org).toBeDefined();
    expect(org?.useMaster).toBe("dojos");
    expect(org?.hideKanaOnMasterSelect).toBe(true);
  });

  it("height and weight should have step and unit", () => {
    const height = FIELD_POOL.find((f) => f.key === "height");
    const weight = FIELD_POOL.find((f) => f.key === "weight");
    expect(height).toBeDefined();
    expect(height?.step).toBe(0.1);
    expect(height?.unit).toBe("cm");
    expect(weight).toBeDefined();
    expect(weight?.step).toBe(0.1);
    expect(weight?.unit).toBe("kg");
  });

  it("martial_arts_experience should have maxLength", () => {
    const exp = FIELD_POOL.find((f) => f.key === "martial_arts_experience");
    expect(exp).toBeDefined();
    expect(exp?.maxLength).toBe(150);
  });

  it("grade field should be select type with fixedChoices", () => {
    const grade = FIELD_POOL.find((f) => f.key === "grade");
    expect(grade).toBeDefined();
    expect(grade?.type).toBe("select");
    expect(grade?.dbColumn).toBe("grade");
    expect(grade?.label).toBe("年代区分");
    expect(grade?.fixedChoices).toBeDefined();
    expect(grade?.fixedChoices?.length).toBeGreaterThan(0);
    // Should include kindergarten, elementary, middle school, and age-based categories
    const values = grade?.fixedChoices?.map((c) => c.value);
    expect(values).toContain("年少");
    expect(values).toContain("小1");
    expect(values).toContain("中3");
    expect(values).toContain("一般");
  });
});

// ──────────────────────────────────────────────
// getFieldDef
// ──────────────────────────────────────────────

describe("getFieldDef", () => {
  it("should return the field definition for a valid key", () => {
    const result = getFieldDef("full_name");
    expect(result).toBeDefined();
    expect(result?.key).toBe("full_name");
    expect(result?.label).toBe("参加者フルネーム");
    expect(result?.type).toBe("text");
    expect(result?.category).toBe("basic");
  });

  it("should return undefined for a non-existent key", () => {
    expect(getFieldDef("non_existent")).toBeUndefined();
  });

  it("should return undefined for an empty string", () => {
    expect(getFieldDef("")).toBeUndefined();
  });
});

// ──────────────────────────────────────────────
// isKanaField
// ──────────────────────────────────────────────

describe("isKanaField", () => {
  it("should return true for kana fields", () => {
    expect(isKanaField("kana")).toBe(true);
    expect(isKanaField("organization_kana")).toBe(true);
    expect(isKanaField("branch_kana")).toBe(true);
  });

  it("should return false for non-kana fields", () => {
    expect(isKanaField("full_name")).toBe(false);
    expect(isKanaField("age")).toBe(false);
    expect(isKanaField("email")).toBe(false);
  });

  it("should return false for non-existent keys", () => {
    expect(isKanaField("non_existent")).toBe(false);
  });
});

// ──────────────────────────────────────────────
// getKanaFieldKey
// ──────────────────────────────────────────────

describe("getKanaFieldKey", () => {
  it("should return kana key for full_name", () => {
    expect(getKanaFieldKey("full_name")).toBe("kana");
  });

  it("should return kana key for organization", () => {
    expect(getKanaFieldKey("organization")).toBe("organization_kana");
  });

  it("should return kana key for branch", () => {
    expect(getKanaFieldKey("branch")).toBe("branch_kana");
  });

  it("should return undefined for fields without kana", () => {
    expect(getKanaFieldKey("age")).toBeUndefined();
    expect(getKanaFieldKey("email")).toBeUndefined();
  });

  it("should return undefined for non-existent keys", () => {
    expect(getKanaFieldKey("non_existent")).toBeUndefined();
  });
});

// ──────────────────────────────────────────────
// CATEGORY_LABELS
// ──────────────────────────────────────────────

describe("CATEGORY_LABELS", () => {
  it("should have labels for all categories", () => {
    expect(CATEGORY_LABELS.basic).toBe("基本情報");
    expect(CATEGORY_LABELS.affiliation).toBe("所属・経験");
    expect(CATEGORY_LABELS.competition).toBe("競技");
    expect(CATEGORY_LABELS.equipment).toBe("防具");
  });

  it("should have exactly 4 categories", () => {
    expect(Object.keys(CATEGORY_LABELS)).toHaveLength(4);
  });
});

// ──────────────────────────────────────────────
// DB_COLUMN_FIELDS / EXTRA_FIELDS
// ──────────────────────────────────────────────

describe("DB_COLUMN_FIELDS", () => {
  it("should include fields with dbColumn", () => {
    expect(DB_COLUMN_FIELDS).toContain("full_name");
    expect(DB_COLUMN_FIELDS).toContain("kana");
    expect(DB_COLUMN_FIELDS).toContain("age");
    expect(DB_COLUMN_FIELDS).toContain("sex");
    expect(DB_COLUMN_FIELDS).toContain("height");
    expect(DB_COLUMN_FIELDS).toContain("weight");
    expect(DB_COLUMN_FIELDS).toContain("grade");
  });

  it("should not include fields without dbColumn", () => {
    expect(DB_COLUMN_FIELDS).not.toContain("prefecture");
    expect(DB_COLUMN_FIELDS).not.toContain("phone");
    expect(DB_COLUMN_FIELDS).not.toContain("email");
    expect(DB_COLUMN_FIELDS).not.toContain("organization");
    expect(DB_COLUMN_FIELDS).not.toContain("rule_preference");
  });
});

describe("EXTRA_FIELDS", () => {
  it("should include fields without dbColumn", () => {
    expect(EXTRA_FIELDS).toContain("prefecture");
    expect(EXTRA_FIELDS).toContain("phone");
    expect(EXTRA_FIELDS).toContain("email");
    expect(EXTRA_FIELDS).toContain("organization");
    expect(EXTRA_FIELDS).toContain("rule_preference");
  });

  it("should not include fields with dbColumn", () => {
    expect(EXTRA_FIELDS).not.toContain("full_name");
    expect(EXTRA_FIELDS).not.toContain("age");
    expect(EXTRA_FIELDS).not.toContain("height");
  });
});

describe("DB_COLUMN_FIELDS + EXTRA_FIELDS", () => {
  it("should cover all FIELD_POOL keys", () => {
    const allKeys = [...DB_COLUMN_FIELDS, ...EXTRA_FIELDS].sort();
    const poolKeys = FIELD_POOL.map((f) => f.key).sort();
    expect(allKeys).toEqual(poolKeys);
  });

  it("should have no overlap", () => {
    const dbSet = new Set(DB_COLUMN_FIELDS);
    const extraSet = new Set(EXTRA_FIELDS);
    const intersection = [...dbSet].filter((k) => extraSet.has(k));
    expect(intersection).toEqual([]);
  });
});

// ──────────────────────────────────────────────
// FIXED_FIELD_KEYS / isCustomField
// ──────────────────────────────────────────────

describe("FIXED_FIELD_KEYS", () => {
  it("should contain all standard pool keys", () => {
    for (const field of FIELD_POOL) {
      expect(FIXED_FIELD_KEYS.has(field.key)).toBe(true);
    }
  });
});

describe("isCustomField", () => {
  it("should return false for fixed field keys", () => {
    expect(isCustomField("full_name")).toBe(false);
    expect(isCustomField("kana")).toBe(false);
    expect(isCustomField("age")).toBe(false);
    expect(isCustomField("sex")).toBe(false);
    expect(isCustomField("email")).toBe(false);
    expect(isCustomField("rule_preference")).toBe(false);
  });

  it("should return true for non-fixed keys", () => {
    expect(isCustomField("guardian_name")).toBe(true);
    expect(isCustomField("match_experience")).toBe(true);
    expect(isCustomField("some_random_key")).toBe(true);
  });
});

// ──────────────────────────────────────────────
// DEFAULT_CUSTOM_FIELDS
// ──────────────────────────────────────────────

describe("DEFAULT_CUSTOM_FIELDS", () => {
  it("should have sequential sort_order starting from 0", () => {
    const sortOrders = DEFAULT_CUSTOM_FIELDS.map((f) => f.sort_order);
    for (let i = 0; i < sortOrders.length; i++) {
      expect(sortOrders[i]).toBe(i);
    }
  });

  it("should have unique field_keys", () => {
    const keys = DEFAULT_CUSTOM_FIELDS.map((f) => f.field_key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("should have valid field_types", () => {
    const validTypes = ["text", "number", "select", "checkbox", "textarea"];
    for (const field of DEFAULT_CUSTOM_FIELDS) {
      expect(validTypes).toContain(field.field_type);
    }
  });

  it("guardian_name should be text with null choices", () => {
    const guardian = DEFAULT_CUSTOM_FIELDS.find((f) => f.field_key === "guardian_name");
    expect(guardian).toBeDefined();
    expect(guardian?.field_type).toBe("text");
    expect(guardian?.choices).toBeNull();
  });

  it("select/checkbox fields should have non-null choices", () => {
    const fieldsWithChoices = DEFAULT_CUSTOM_FIELDS.filter(
      (f) => f.field_type === "select" || f.field_type === "checkbox"
    );
    for (const field of fieldsWithChoices) {
      expect(field.choices).not.toBeNull();
      expect(field.choices?.length).toBeGreaterThan(0);
    }
  });

  it("all custom fields should be recognized as custom by isCustomField", () => {
    for (const field of DEFAULT_CUSTOM_FIELDS) {
      expect(isCustomField(field.field_key)).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────
// customFieldToPoolItem
// ──────────────────────────────────────────────

describe("customFieldToPoolItem", () => {
  const baseCustomField: CustomFieldDef = {
    id: "test-id",
    form_config_id: "config-id",
    field_key: "test_field",
    label: "テストフィールド",
    field_type: "text",
    choices: null,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
  };

  it("should convert text type correctly", () => {
    const result = customFieldToPoolItem(baseCustomField);
    expect(result.key).toBe("test_field");
    expect(result.label).toBe("テストフィールド");
    expect(result.type).toBe("text");
    expect(result.category).toBe("basic");
    expect(result.defaultRequired).toBe(false);
    expect(result.defaultChoices).toBeUndefined();
  });

  it("should convert select type with choices", () => {
    const selectField: CustomFieldDef = {
      ...baseCustomField,
      field_type: "select",
      choices: [
        { label: "選択肢1", value: "opt1" },
        { label: "選択肢2", value: "opt2" },
      ],
    };
    const result = customFieldToPoolItem(selectField);
    expect(result.type).toBe("select");
    expect(result.defaultChoices).toEqual([
      { label: "選択肢1", value: "opt1" },
      { label: "選択肢2", value: "opt2" },
    ]);
  });

  it("should convert checkbox type", () => {
    const checkboxField: CustomFieldDef = {
      ...baseCustomField,
      field_type: "checkbox",
      choices: [{ label: "チェック", value: "check" }],
    };
    const result = customFieldToPoolItem(checkboxField);
    expect(result.type).toBe("checkbox");
  });

  it("should convert number type", () => {
    const numberField: CustomFieldDef = {
      ...baseCustomField,
      field_type: "number",
    };
    const result = customFieldToPoolItem(numberField);
    expect(result.type).toBe("number");
  });

  it("should convert textarea type", () => {
    const textareaField: CustomFieldDef = {
      ...baseCustomField,
      field_type: "textarea",
    };
    const result = customFieldToPoolItem(textareaField);
    expect(result.type).toBe("textarea");
  });

  it("should fallback to text for unknown field_type", () => {
    const unknownField = {
      ...baseCustomField,
      field_type: "unknown" as CustomFieldDef["field_type"],
    };
    const result = customFieldToPoolItem(unknownField);
    expect(result.type).toBe("text");
  });

  it("should set defaultChoices to undefined when choices is null", () => {
    const result = customFieldToPoolItem(baseCustomField);
    expect(result.defaultChoices).toBeUndefined();
  });

  it("should always set category to basic", () => {
    const result = customFieldToPoolItem(baseCustomField);
    expect(result.category).toBe("basic");
  });

  it("should always set defaultRequired to false", () => {
    const result = customFieldToPoolItem(baseCustomField);
    expect(result.defaultRequired).toBe(false);
  });
});
