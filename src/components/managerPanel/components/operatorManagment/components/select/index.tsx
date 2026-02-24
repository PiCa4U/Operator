import React, { useMemo, useRef, useLayoutEffect, useState } from "react";
import Select, {
    StylesConfig,
    SingleValue,
    MultiValue,
    GroupBase,
    components,
    OptionProps,
} from "react-select";

export type Option = { value: string; label: string };
type OptionsProp = string[] | Option[];

type PropsSingle = {
    isMulti?: false;
    value: string | null;
    onChange: (val: string | null) => void;
};

type PropsMulti = {
    isMulti: true;
    value: string[];
    onChange: (val: string[]) => void;
};

type Common = {
    options: OptionsProp;
    placeholder?: string;
    isSearchable?: boolean;
    isClearable?: boolean;
    isDisabled?: boolean;

    /** ✅ Для multi: показывать галочки в меню и не закрывать меню */
    withCheckboxes?: boolean;
    classNamePrefix?: string;
};

type Props = Common & (PropsSingle | PropsMulti);

const buildStyles = (
    menuWidth?: number
): StylesConfig<Option, boolean, GroupBase<Option>> => ({
    container: (base) => ({
        ...base,
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        height: "calc(1.5em + .75rem + 2px)",
    }),
    control: (base, { isFocused }) => ({
        ...base,
        border: "1px solid #ced4da",
        backgroundColor: "#fff",
        borderRadius: "0.75rem",
        minHeight: "calc(1.5em + .75rem + 2px)",
        padding: 0,
        boxShadow: isFocused ? "0 0 0 .2rem rgba(65, 212, 146, .25)" : "none",
        cursor: "pointer",
        "&:hover": { borderColor: "#ced4da" },
    }),
    valueContainer: (base) => ({
        ...base,
        display: "flex",
        flexWrap: "nowrap",
        alignItems: "center",
        padding: "0 .75rem",
        minHeight: "calc(1.5em + .75rem + 2px)",
        overflow: "hidden",
        flex: 1,
        minWidth: 0,
    }),
    placeholder: (base) => ({
        ...base,
        lineHeight: "calc(1.5em + .75rem + 2px)",
        color: "#495057",
    }),
    input: (base) => ({
        ...base,
        flexShrink: 0,
        flexGrow: 0,
        width: "auto",
        minWidth: 2,
    }),
    singleValue: (base) => ({
        ...base,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        flexShrink: 1,
        flexGrow: 1,
        minWidth: 0,
        maxWidth: "100%",
    }),
    dropdownIndicator: (base) => ({
        ...base,
        padding: 0,
        height: "100%",
        display: "flex",
        alignItems: "center",
    }),
    indicatorSeparator: () => ({ display: "none" }),
    clearIndicator: (base) => ({
        ...base,
        padding: "0 8px",
        cursor: "pointer",
        color: "#999",
        "&:hover": { color: "#333" },
    }),
    menuPortal: (base) => ({
        ...base,
        zIndex: 2000,
        width: menuWidth ? `${menuWidth}px` : undefined,
    }),
    menu: (base) => ({
        ...base,
        width: menuWidth ? `${menuWidth}px` : "100%",
        minWidth: menuWidth ? `${menuWidth}px` : "100%",
        maxWidth: "none",
    }),
    option: (base, { isFocused }) => ({
        ...base,
        backgroundColor: isFocused ? "#f8f9fa" : "white",
        color: "#212529",
        cursor: "pointer",
    }),
});

// ✅ чекбокс-опция для multi
const CheckboxOption = (props: OptionProps<Option, true>) => {
    return (
        <components.Option {...props}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={props.isSelected} readOnly />
                <span>{props.label}</span>
            </div>
        </components.Option>
    );
};

const OperatorsSelect: React.FC<Props> = ({
                                              isMulti,
                                              value,
                                              options,
                                              onChange,
                                              placeholder = "Выберите…",
                                              isSearchable = true,
                                              isClearable = true,
                                              isDisabled = false,
                                              withCheckboxes = false,
                                              classNamePrefix = "ops",
                                          }) => {
    const wrapRef = useRef<HTMLDivElement>(null);
    const [menuWidth, setMenuWidth] = useState<number | undefined>(undefined);

    useLayoutEffect(() => {
        const update = () => setMenuWidth(wrapRef.current?.offsetWidth || undefined);
        update();
        const ro = new ResizeObserver(update);
        if (wrapRef.current) ro.observe(wrapRef.current);
        window.addEventListener("resize", update);
        return () => {
            ro.disconnect();
            window.removeEventListener("resize", update);
        };
    }, []);

    const styles = useMemo(() => buildStyles(menuWidth), [menuWidth]);

    // ✅ поддержка options: string[] | {value,label}[]
    const opts = useMemo<Option[]>(() => {
        if (!Array.isArray(options) || options.length === 0) return [];
        const first = (options as any)[0];
        if (typeof first === "string") {
            return (options as string[]).map((d) => ({ value: d, label: d }));
        }
        return (options as Option[]).map((o) => ({ value: o.value, label: o.label }));
    }, [options]);

    const labelByValue = useMemo(() => {
        const m = new Map<string, string>();
        opts.forEach((o) => m.set(o.value, o.label));
        return m;
    }, [opts]);

    const toOpt = (v: string) => ({ value: v, label: labelByValue.get(v) ?? v });

    return (
        <div ref={wrapRef} style={{ width: "100%" }}>
            {isMulti ? (
                <Select<Option, true>
                    value={(value as string[]).map(toOpt)}
                    options={opts}
                    isMulti
                    isSearchable={isSearchable}
                    isClearable={isClearable}
                    isDisabled={isDisabled}
                    onChange={(items: MultiValue<Option>) => onChange(items.map((o) => o.value))}
                    styles={styles}
                    placeholder={placeholder}
                    menuPlacement="auto"
                    menuPortalTarget={document.body}
                    menuPosition="fixed"
                    menuShouldScrollIntoView={false}
                    // ✅ чекбоксы
                    closeMenuOnSelect={!withCheckboxes}
                    hideSelectedOptions={false}
                    components={withCheckboxes ? { Option: CheckboxOption } : undefined}
                    classNamePrefix={classNamePrefix}
                />
            ) : (
                <Select<Option, false>
                    value={(value as string | null) ? toOpt(value as string) : null}
                    options={opts}
                    isSearchable={isSearchable}
                    isClearable={isClearable}
                    isDisabled={isDisabled}
                    onChange={(opt: SingleValue<Option>) =>
                        (onChange as PropsSingle["onChange"])(opt?.value ?? null)
                    }
                    styles={styles}
                    placeholder={placeholder}
                    menuPlacement="auto"
                    menuPortalTarget={document.body}
                    menuPosition="fixed"
                    menuShouldScrollIntoView={false}
                    classNamePrefix={classNamePrefix}
                />
            )}
        </div>
    );
};

export default OperatorsSelect;