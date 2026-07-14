import type {I_DataStructure} from "docpouch-client";
import {
    buildPropagationPlan,
    defaultValueForField,
    diffStructures,
    isStructureMetadataChange,
} from "../../src/srv/vue/components/structurePropagation/index.ts";

function makeStructure(fields: Array<{name: string; displayName?: string; type: string; items?: string}>, overrides: Partial<I_DataStructure> = {}): I_DataStructure {
    return {
        _id: "struct1",
        name: "Test",
        description: "",
        type: 1,
        subType: 1,
        fields: fields.map(f => ({
            name: f.name,
            displayName: f.displayName ?? f.name,
            type: f.type,
            items: f.items,
        })),
        ...overrides,
    };
}

describe("diffStructures", () => {
    test("flags no structural change for identical structures", () => {
        const s = makeStructure([{name: "a", type: "string"}]);
        const diff = diffStructures(s, s);
        expect(diff.hasStructuralChange).toBe(false);
        expect(diff.removedFields).toHaveLength(0);
        expect(diff.addedFields).toHaveLength(0);
        expect(diff.changedFields).toHaveLength(0);
    });

    test("detects added fields", () => {
        const before = makeStructure([{name: "a", type: "string"}]);
        const after = makeStructure([
            {name: "a", type: "string"},
            {name: "b", type: "number"},
        ]);
        const diff = diffStructures(before, after);
        expect(diff.hasStructuralChange).toBe(true);
        expect(diff.addedFields.map(f => f.name)).toEqual(["b"]);
    });

    test("detects removed fields", () => {
        const before = makeStructure([
            {name: "a", type: "string"},
            {name: "b", type: "number"},
        ]);
        const after = makeStructure([{name: "a", type: "string"}]);
        const diff = diffStructures(before, after);
        expect(diff.hasStructuralChange).toBe(true);
        expect(diff.removedFields.map(f => f.name)).toEqual(["b"]);
    });

    test("detects changed field types", () => {
        const before = makeStructure([{name: "a", type: "string"}]);
        const after = makeStructure([{name: "a", type: "number"}]);
        const diff = diffStructures(before, after);
        expect(diff.hasStructuralChange).toBe(true);
        expect(diff.changedFields).toHaveLength(1);
        expect(diff.changedFields[0].oldField.type).toBe("string");
        expect(diff.changedFields[0].newField.type).toBe("number");
    });

    test("handles undefined old structure (creation case)", () => {
        const after = makeStructure([{name: "a", type: "string"}]);
        const diff = diffStructures(undefined, after);
        expect(diff.hasStructuralChange).toBe(true);
        expect(diff.addedFields.map(f => f.name)).toEqual(["a"]);
    });
});

describe("isStructureMetadataChange", () => {
    test("returns false for identical structures", () => {
        const s = makeStructure([{name: "a", type: "string"}]);
        expect(isStructureMetadataChange(s, s)).toBe(false);
    });

    test("returns true when name changes", () => {
        const before = makeStructure([], {name: "A"});
        const after = makeStructure([], {name: "B"});
        expect(isStructureMetadataChange(before, after)).toBe(true);
    });

    test("returns true when type or subType changes", () => {
        const before = makeStructure([], {type: 1, subType: 1});
        const after = makeStructure([], {type: 2, subType: 1});
        expect(isStructureMetadataChange(before, after)).toBe(true);
    });
});

describe("defaultValueForField", () => {
    test("returns sensible defaults for each type", () => {
        expect(defaultValueForField({name: "a", displayName: "A", type: "string"})).toBe("");
        expect(defaultValueForField({name: "a", displayName: "A", type: "number"})).toBe(0);
        expect(defaultValueForField({name: "a", displayName: "A", type: "boolean"})).toBe(false);
        expect(defaultValueForField({name: "a", displayName: "A", type: "array"})).toEqual([]);
        expect(defaultValueForField({name: "a", displayName: "A", type: "structure"})).toEqual({});
    });
});

describe("buildPropagationPlan", () => {
    test("keeps existing values for fields that survive the change", () => {
        const before = makeStructure([
            {name: "cityName", type: "string"},
            {name: "inhabitants", type: "number"},
        ]);
        const after = makeStructure([
            {name: "cityName", type: "string"},
            {name: "inhabitants", type: "number"},
        ]);
        const plan = buildPropagationPlan(before, after, {cityName: "Zurich", inhabitants: 400000}, {});
        expect(plan.newContent).toEqual({cityName: "Zurich", inhabitants: 400000});
        expect(plan.droppedFields).toEqual([]);
        expect(plan.addedFieldNames).toEqual([]);
        expect(plan.renamedFields).toEqual([]);
    });

    test("adds new fields with default values", () => {
        const before = makeStructure([{name: "a", type: "string"}]);
        const after = makeStructure([
            {name: "a", type: "string"},
            {name: "b", type: "number"},
        ]);
        const plan = buildPropagationPlan(before, after, {a: "hello"}, {});
        expect(plan.newContent).toEqual({a: "hello", b: 0});
        expect(plan.addedFieldNames).toEqual(["b"]);
    });

    test("drops removed fields when no rename mapping is supplied", () => {
        const before = makeStructure([
            {name: "a", type: "string"},
            {name: "b", type: "number"},
        ]);
        const after = makeStructure([{name: "a", type: "string"}]);
        const plan = buildPropagationPlan(before, after, {a: "hello", b: 42}, {});
        expect(plan.newContent).toEqual({a: "hello"});
        expect(plan.droppedFields).toEqual(["b"]);
    });

    test("renames a removed field via renameMap", () => {
        const before = makeStructure([
            {name: "cityName", type: "string"},
        ]);
        const after = makeStructure([{name: "name", type: "string"}]);
        const plan = buildPropagationPlan(before, after, {cityName: "Zurich"}, {cityName: "name"});
        expect(plan.newContent).toEqual({name: "Zurich"});
        expect(plan.renamedFields).toEqual([{from: "cityName", to: "name"}]);
        expect(plan.droppedFields).toEqual([]);
    });

    test("rename keeps an existing value in the target key", () => {
        const before = makeStructure([{name: "old", type: "string"}]);
        const after = makeStructure([{name: "new", type: "string"}]);
        const plan = buildPropagationPlan(before, after, {old: "oldValue", new: "newValue"}, {old: "new"});
        expect(plan.newContent).toEqual({new: "newValue"});
    });

    test("ignores renameMap entries whose target does not exist in the new structure", () => {
        const before = makeStructure([{name: "a", type: "string"}]);
        const after = makeStructure([{name: "b", type: "string"}]);
        const plan = buildPropagationPlan(before, after, {a: "value"}, {a: "nonexistent"});
        expect(plan.newContent).toEqual({b: ""});
        expect(plan.droppedFields).toEqual(["a"]);
    });

    test("preserves unrelated extra keys already present in content", () => {
        const before = makeStructure([{name: "a", type: "string"}]);
        const after = makeStructure([{name: "a", type: "string"}]);
        const plan = buildPropagationPlan(before, after, {a: "x", extra: "y"}, {});
        expect(plan.newContent).toEqual({a: "x", extra: "y"});
    });

    test("treats array content as empty object base", () => {
        const before = makeStructure([{name: "a", type: "string"}]);
        const after = makeStructure([
            {name: "a", type: "string"},
            {name: "b", type: "string"},
        ]);
        const plan = buildPropagationPlan(before, after, [{label: "old format"}], {});
        expect(plan.newContent).toEqual({a: "", b: ""});
    });
});