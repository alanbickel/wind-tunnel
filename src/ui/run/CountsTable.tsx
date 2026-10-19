/** A row of counts, named for its first column. */
export interface CountsRow {
  readonly id: string;
  readonly label: string;
}

/** One numeric column: its header and its value for a row. */
export interface CountsColumn<Row> {
  readonly header: string;
  readonly value: (row: Row) => number;
}

export interface CountsTableProps<Row extends CountsRow> {
  readonly caption: string;
  /** Heads the label column, e.g. "Workflow". */
  readonly labelHeader: string;
  readonly columns: readonly CountsColumn<Row>[];
  readonly rows: readonly Row[];
  /** A last row set apart in the footer, such as the sum of the others. */
  readonly footer?: Row;
}

/** A table of counts, one row per thing counted. */
export function CountsTable<Row extends CountsRow>(
  props: CountsTableProps<Row>,
) {
  const { caption, labelHeader, columns, rows, footer } = props;
  return (
    <table>
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{labelHeader}</th>
          {columns.map((column) => (
            <th key={column.header} scope="col">
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <CountsTableRow key={row.id} row={row} columns={columns} />
        ))}
      </tbody>
      {footer && (
        <tfoot>
          <CountsTableRow row={footer} columns={columns} />
        </tfoot>
      )}
    </table>
  );
}

interface CountsTableRowProps<Row> {
  readonly row: Row;
  readonly columns: readonly CountsColumn<Row>[];
}

function CountsTableRow<Row extends CountsRow>({
  row,
  columns,
}: CountsTableRowProps<Row>) {
  return (
    <tr>
      <th scope="row">{row.label}</th>
      {columns.map((column) => (
        <td key={column.header}>{column.value(row).toLocaleString("en-US")}</td>
      ))}
    </tr>
  );
}
