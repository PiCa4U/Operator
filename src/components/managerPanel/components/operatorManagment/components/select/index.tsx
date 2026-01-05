import React, { useMemo, useRef, useLayoutEffect, useState } from "react";
import Select, {
    StylesConfig,
    SingleValue,
    MultiValue,
    GroupBase,
} from "react-select";

type Option = { value: string; label: string };

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
    options: string[];
    placeholder?: string;
    isSearchable?: boolean;
    isClearable?: boolean;
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
    // меню такой же ширины, как инпут
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

const OperatorsSelect: React.FC<Props> = ({
                                              isMulti,
                                              value,
                                              options,
                                              onChange,
                                              placeholder = "Выберите…",
                                              isSearchable = true,
                                              isClearable = true,
                                          }) => {
    // меряем ширину контейнера: меню будет ровно этой ширины
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
    const opts = useMemo<Option[]>(() => options.map((d) => ({ value: d, label: d })), [options]);

    return (
        <div ref={wrapRef} style={{ width: "100%" }}>
            {isMulti ? (
                <Select<Option, true>
                    value={(value as string[]).map((v) => ({ value: v, label: v }))}
                    options={opts}
                    isMulti
                    isSearchable={isSearchable}
                    isClearable={isClearable}
                    onChange={(items: MultiValue<Option>) => onChange(items.map((o) => o.value))}
                    styles={styles}
                    placeholder={placeholder}
                    menuPlacement="auto"
                    menuPortalTarget={document.body}
                    menuPosition="fixed"
                    menuShouldScrollIntoView={false}
                />
            ) : (
                <Select<Option, false>
                    value={(value as string | null) ? { value: value as string, label: value as string } : null}
                    options={opts}
                    isSearchable={isSearchable}
                    isClearable={isClearable}
                    onChange={(opt: SingleValue<Option>) =>
                        (onChange as PropsSingle["onChange"])(opt?.value ?? null)
                    }
                    styles={styles}
                    placeholder={placeholder}
                    menuPlacement="auto"
                    menuPortalTarget={document.body}
                    menuPosition="fixed"
                    menuShouldScrollIntoView={false}
                />
            )}
        </div>
    );
};

export default OperatorsSelect;
