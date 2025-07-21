import React from "react";
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
    if (!charts.length) return null;

    // Предполагаем, что X — это общий интервал (0, 1, 2... 23)
    const xValues = charts[0].data.map((point) => point.x);

    // Построим строки таблицы
    const rows = xValues.map((x, idx) => {
        const row: Record<string, any> = { Интервал: x };
        charts.forEach((chart) => {
            row[chart.label] = chart.data[idx]?.y ?? 0;
        });
        return row;
    });

    // Колонки
    const columns = [
        { name: "Интервал", selector: (row: any) => row["Интервал"], sortable: true },
        ...charts.map((chart) => ({
            name: chart.label,
            selector: (row: any) => row[chart.label],
            sortable: true,
        })),
    ];

    // CSV
    const csvHeaders = columns.map(col => ({ label: col.name, key: col.name }));
    const csvData = rows;

    // Excel
    const exportToExcel = () => {
        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "ChartData");
        const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
        const data = new Blob([excelBuffer], { type: "application/octet-stream" });
        saveAs(data, "chart-data.xlsx");
    };

    // PDF
    const exportToPDF = () => {
        const doc = new jsPDF();
        const tableColumn = columns.map((col) => col.name);
        const tableRows = rows.map((row) => columns.map((col) => row[col.name]));

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
        });
        doc.save("chart-data.pdf");
    };

    return (
        <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 8, display: "flex", gap: 8 }}>
                <CSVLink
                    data={csvData}
                    headers={csvHeaders}
                    filename="chart-data.csv"
                    className="btn btn-outline-secondary"
                >
                    CSV
                </CSVLink>
                <button onClick={exportToExcel} className="btn btn-outline-secondary">Excel</button>
                <button onClick={exportToPDF} className="btn btn-outline-secondary">PDF</button>
            </div>
            <DataTable
                columns={columns}
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
