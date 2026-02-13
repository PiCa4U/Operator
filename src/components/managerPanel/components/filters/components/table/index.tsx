import React, { useMemo } from "react";
import DataTable from "react-data-table-component";
import { CSVLink } from "react-csv";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { MyChartData } from "../../index";

interface Props {
    charts: MyChartData[];
}

export const ChartDataTable: React.FC<Props> = ({ charts }) => {

    // ✅ Берём все X-значения из всех серий, чтобы не было "кривой" таблицы
    const xValues = useMemo(() => {
        const set = new Set<string>();
        charts.forEach((c) => c.data.forEach((p) => set.add(p.x)));
        return Array.from(set);
    }, [charts]);

    const rows = useMemo(() => {
        return xValues.map((x) => {
            const row: Record<string, any> = { Интервал: x };
            charts.forEach((chart) => {
                const found = chart.data.find((p) => p.x === x);
                row[chart.label] = found?.y ?? 0;
            });
            return row;
        });
    }, [xValues, charts]);

    const columns = useMemo(() => {
        return [
            { name: "Интервал", selector: (row: any) => row["Интервал"], sortable: true },
            ...charts.map((chart) => ({
                name: chart.label,
                selector: (row: any) => row[chart.label],
                sortable: true,
            })),
        ];
    }, [charts]);

    const csvHeaders = columns.map((col) => ({ label: col.name as string, key: col.name as string }));
    const csvData = rows;

    const exportToExcel = () => {
        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "ChartData");
        const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
        const data = new Blob([excelBuffer], { type: "application/octet-stream" });
        saveAs(data, "chart-data.xlsx");
    };

    const exportToPDF = () => {
        const doc = new jsPDF();
        const tableColumn = columns.map((col: any) => col.name);
        const tableRows = rows.map((row) => columns.map((col: any) => row[col.name]));
        autoTable(doc, { head: [tableColumn], body: tableRows });
        doc.save("chart-data.pdf");
    };
    if (!charts.length) return null;

    return (
        <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 8, display: "flex", gap: 8 }}>
                <CSVLink data={csvData} headers={csvHeaders} filename="chart-data.csv" className="btn btn-outline-secondary">
                    CSV
                </CSVLink>
                <button onClick={exportToExcel} className="btn btn-outline-secondary">
                    Excel
                </button>
                <button onClick={exportToPDF} className="btn btn-outline-secondary">
                    PDF
                </button>
            </div>

            <DataTable
                columns={columns as any}
                data={rows}
                pagination
                dense
                highlightOnHover
                striped
                defaultSortField="Интервал"
                defaultSortAsc={false}
            />
        </div>
    );
};
