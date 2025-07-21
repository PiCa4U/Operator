declare module "react-data-table-component" {
    import * as React from "react";

    export interface Column<T> {
        name: string;
        selector?: (row: T) => any;
        sortable?: boolean;
        grow?: number;
        minWidth?: string;
        maxWidth?: string;
        wrap?: boolean;
        center?: boolean;
        right?: boolean;
        compact?: boolean;
        cell?: (row: T, index: number, column: Column<T>, id: string) => React.ReactNode;
        ignoreRowClick?: boolean;
        button?: boolean;
        allowOverflow?: boolean;
    }

    export interface DataTableProps<T> {
        title?: string;
        columns: Column<T>[];
        data: T[];
        pagination?: boolean;
        dense?: boolean;
        highlightOnHover?: boolean;
        striped?: boolean;
        defaultSortField?: string;
        defaultSortAsc?: boolean;
    }

    export default function DataTable<T>(props: DataTableProps<T>): JSX.Element;
}
