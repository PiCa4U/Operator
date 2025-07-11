import React, { useState, useEffect } from 'react';
import { FieldDefinition } from "../index";
import SearchableSelect from './select';

interface EditableFieldsProps {
    params: FieldDefinition[];
    initialValues?: { [fieldId: string]: string };
    onChange?: (values: { [fieldId: string]: string }) => void;
    augmentSaved?: boolean;
}

const EditableFields: React.FC<EditableFieldsProps> = ({
                                                           params,
                                                           initialValues = {},
                                                           onChange,
                                                           augmentSaved = false
                                                       }) => {
    const [fieldValues, setFieldValues] = useState<{ [fieldId: string]: string }>(initialValues);
    const visibleParams = params.filter(param => !param.deleted);

    useEffect(() => {
        setFieldValues(initialValues);
    }, [initialValues]);

    const handleChange = (fieldId: string, newValue: string) => {
        const newValues = { ...fieldValues, [fieldId]: newValue };
        setFieldValues(newValues);
        onChange?.(newValues);
    };


    return (
        <div>
            {visibleParams.map(param => {
                const currentValue = fieldValues[param.field_id] || '';
                const commonProps = {
                    className: "form-control",
                    value: currentValue,
                    onChange: (e: React.ChangeEvent<
                        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
                    >) => handleChange(param.field_id, e.target.value),
                    readOnly: !param.editable,
                };

                return (
                    <div
                        key={param.id}
                        className="form-group"
                        style={{
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center',
                            flexWrap: 'nowrap',
                            marginBottom: '1rem'
                        }}
                    >
                        <label
                            style={{
                                whiteSpace: 'nowrap',
                                fontWeight: '400',
                                fontSize: '20px',
                                marginRight: '8px'
                            }}
                        >
                            {param.field_name} {/* TODO TEST */}
                            {/*<span*/}
                            {/*    style={{ color: '#888', fontSize: '14px', marginLeft: '4px' }}*/}
                            {/*>*/}
                            {/*    ({param.field_id}) /!* TODO TEST *!/*/}
                            {/*</span>*/}
                            {param.must_have && <span style={{ color: 'red' }}> *</span>}:
                        </label>

                        {param.field_type === 'regular' && <input type="text" style={{fontSize: 18, fontWeight: 500}} {...commonProps} />}
                        {param.field_type === 'number' && <input type="number" style={{fontSize: 18, fontWeight: 500}} {...commonProps} />}
                        {param.field_type === 'date' && <input type="date" style={{fontSize: 18, fontWeight: 500}} {...commonProps} />}
                        {param.field_type === 'time' && <input type="time" style={{fontSize: 18, fontWeight: 500}} {...commonProps} />}
                        {param.field_type === 'textarea' && <textarea style={{fontSize: 18, fontWeight: 500}} {...commonProps} />}

                        {param.field_type === 'select' && (() => {
                            const raw = param.field_vals || '';
                            const splitVals = raw.includes('|_|_|')
                                ? raw.split('|_|_|')
                                : raw.split(',');
                            let opts = splitVals.map(s => s.trim()).filter(Boolean);

                            // 🔽 нормализуем текущее значение
                            const normalizedValue = currentValue.includes('|_|_|')
                                ? currentValue.split('|_|_|')[0].trim()
                                : currentValue;

                            // 🔁 добавляем текущее значение, если его нет в опциях
                            if (normalizedValue && !opts.includes(normalizedValue)) {
                                opts = [...opts, normalizedValue];
                            }

                            const options = [{ id: '', name: '' }, ...opts.map(o => ({ id: o, name: o }))];

                            return (
                                <SearchableSelect
                                    value={normalizedValue}
                                    onChange={val => handleChange(param.field_id, val)}
                                    options={options}
                                    placeholder="Выберите..."
                                    augmentSaved={augmentSaved}
                                />
                            );
                        })()}

                        {param.field_type === 'checkbox' && (
                            <div className="form-check" style={{ marginLeft: '8px', fontSize: 18}}>
                                <input
                                    type="checkbox"
                                    className="form-check-input"
                                    id={`checkbox_${param.id}`}
                                    checked={currentValue === 'true'}
                                    disabled={!param.editable}
                                    style={{fontSize: 18, fontWeight: 500}}
                                    onChange={e =>
                                        handleChange(
                                            param.field_id,
                                            e.target.checked ? 'true' : 'false'
                                        )
                                    }
                                />
                                <label
                                    className="form-check-label"
                                    htmlFor={`checkbox_${param.id}`}
                                    style={{fontSize: 18, fontWeight: 500}}
                                >
                                    {param.field_vals || 'Выбрать'}
                                </label>
                            </div>
                        )}

                        {param.field_type === 'radio' && (
                            <>
                                {param.field_vals?.split(',').map((opt, idx) => (
                                    <div
                                        className="form-check"
                                        key={idx}
                                        style={{ margin: '0 10px' }}
                                    >
                                        <input
                                            type="radio"
                                            className="form-check-input"
                                            id={`radio_${param.id}_${idx}`}
                                            name={param.field_id}
                                            value={opt}
                                            checked={currentValue === opt}
                                            disabled={!param.editable}
                                            onChange={e =>
                                                handleChange(param.field_id, e.target.value)
                                            }
                                            style={{fontSize: 18, fontWeight: 500}}
                                        />
                                        <label
                                            style={{fontSize: 18, fontWeight: 500}}
                                            className="form-check-label"
                                            htmlFor={`radio_${param.id}_${idx}`}
                                        >
                                            {opt}
                                        </label>
                                    </div>
                                ))}
                            </>
                        )}

                        {param.field_type === 'many' && (
                            <div style={{ marginLeft: '8px' }}>
                                {param.field_vals
                                    ?.split(',')
                                    .map(opt => opt.trim())
                                    .filter(Boolean)
                                    .map((opt, idx) => {
                                        const isChecked = currentValue
                                            .split(',')
                                            .map(v => v.trim())
                                            .includes(opt);
                                        return (
                                            <div
                                                className="form-check"
                                                key={idx}
                                                style={{ marginRight: '10px' }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="form-check-input"
                                                    id={`many_${param.id}_${idx}`}
                                                    value={opt}
                                                    checked={isChecked}
                                                    style={{fontSize: 18, fontWeight: 500}}
                                                    disabled={!param.editable}
                                                    onChange={e => {
                                                        const values = currentValue
                                                            .split(',')
                                                            .map(v => v.trim())
                                                            .filter(Boolean);
                                                        const newValues = e.target.checked
                                                            ? [...values, opt]
                                                            : values.filter(v => v !== opt);
                                                        handleChange(param.field_id, newValues.join(','));
                                                    }}
                                                />
                                                <label
                                                    className="form-check-label"
                                                    htmlFor={`many_${param.id}_${idx}`}
                                                    style={{fontSize: 18, fontWeight: 500}}
                                                >
                                                    {opt}
                                                </label>
                                            </div>
                                        );
                                    })}
                            </div>
                        )}

                        {param.field_type === 'non_editable' && (
                            <input
                                type="text"
                                className="form-control"
                                value={currentValue}
                                readOnly
                                style={{fontSize: 18, fontWeight: 500}}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default EditableFields;
