import type {I_DataStructure, I_StructureField} from "docpouch-client";

export type StructureFieldType = I_StructureField["type"];

export interface IStructureDiff {
    hasStructuralChange: boolean;
    removedFields: I_StructureField[];
    addedFields: I_StructureField[];
    changedFields: { oldField: I_StructureField; newField: I_StructureField }[];
    unchangedFields: I_StructureField[];
}

function fieldSignature(field: I_StructureField): string {
    return `${field.type}|${field.items ?? ""}|${field.displayName ?? ""}`;
}

export function diffStructures(
    oldStructure: I_DataStructure | undefined,
    newStructure: I_DataStructure | undefined
): IStructureDiff {
    const oldFields = oldStructure?.fields ?? [];
    const newFields = newStructure?.fields ?? [];

    const oldByName = new Map<string, I_StructureField>();
    for (const field of oldFields) {
        oldByName.set(field.name, field);
    }
    const newByName = new Map<string, I_StructureField>();
    for (const field of newFields) {
        newByName.set(field.name, field);
    }

    const removedFields: I_StructureField[] = [];
    const addedFields: I_StructureField[] = [];
    const changedFields: { oldField: I_StructureField; newField: I_StructureField }[] = [];
    const unchangedFields: I_StructureField[] = [];

    for (const [name, oldField] of oldByName.entries()) {
        if (!newByName.has(name)) {
            removedFields.push(oldField);
        }
    }
    for (const [name, newField] of newByName.entries()) {
        const oldField = oldByName.get(name);
        if (!oldField) {
            addedFields.push(newField);
        } else if (fieldSignature(oldField) !== fieldSignature(newField)) {
            changedFields.push({oldField, newField});
        } else {
            unchangedFields.push(newField);
        }
    }

    return {
        hasStructuralChange:
            removedFields.length > 0 || addedFields.length > 0 || changedFields.length > 0,
        removedFields,
        addedFields,
        changedFields,
        unchangedFields,
    };
}

export function isStructureMetadataChange(
    oldStructure: I_DataStructure | undefined,
    newStructure: I_DataStructure | undefined
): boolean {
    if (!oldStructure || !newStructure) {
        return true;
    }
    return (
        oldStructure.name !== newStructure.name ||
        oldStructure.description !== newStructure.description ||
        oldStructure.type !== newStructure.type ||
        oldStructure.subType !== newStructure.subType
    );
}

export function defaultValueForField(field: I_StructureField): unknown {
    switch (field.type) {
        case "string":
            return "";
        case "number":
            return 0;
        case "boolean":
            return false;
        case "array":
            return [];
        case "structure":
            return {};
        default:
            return null;
    }
}

export type FieldRenameMap = Record<string, string | undefined>;

export interface IPropagationPlan {
    newContent: unknown;
    droppedFields: string[];
    addedFieldNames: string[];
    renamedFields: { from: string; to: string }[];
}

export function buildPropagationPlan(
    oldStructure: I_DataStructure | undefined,
    newStructure: I_DataStructure,
    currentContent: unknown,
    renameMap: FieldRenameMap
): IPropagationPlan {
    const baseContent =
        currentContent !== null && typeof currentContent === "object" && !Array.isArray(currentContent)
            ? {...(currentContent as Record<string, unknown>)}
            : {};

    const oldFieldsByName = new Map<string, I_StructureField>();
    for (const field of oldStructure?.fields ?? []) {
        oldFieldsByName.set(field.name, field);
    }
    const newFieldsByName = new Map<string, I_StructureField>();
    for (const field of newStructure.fields) {
        newFieldsByName.set(field.name, field);
    }

    const droppedFields: string[] = [];
    const addedFieldNames: string[] = [];
    const renamedFields: { from: string; to: string }[] = [];

    for (const oldField of oldStructure?.fields ?? []) {
        if (!newFieldsByName.has(oldField.name)) {
            const target = renameMap[oldField.name];
            if (target && newFieldsByName.has(target)) {
                const oldValue = baseContent[oldField.name];
                if (baseContent[target] === undefined) {
                    baseContent[target] = oldValue;
                }
                renamedFields.push({from: oldField.name, to: target});
                delete baseContent[oldField.name];
            } else {
                droppedFields.push(oldField.name);
                delete baseContent[oldField.name];
            }
        }
    }

    for (const newField of newStructure.fields) {
        if (!(newField.name in baseContent)) {
            baseContent[newField.name] = defaultValueForField(newField);
            addedFieldNames.push(newField.name);
        }
    }

    return {
        newContent: baseContent,
        droppedFields,
        addedFieldNames,
        renamedFields,
    };
}