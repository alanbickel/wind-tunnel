// react-aws-icons ships no types. Each icon is a default export that draws
// an SVG `size` wide and tall. What an import gives is the component or, in
// the production build, a module object holding it: see `iconOf`, which
// takes both. (A relative import isn't allowed in this declaration, so the
// shape is written out.)
declare module "react-aws-icons/dist/aws/logo/*" {
  type Icon = import("react").ComponentType<{
    readonly size?: string | number;
  }>;
  const imported: Icon | { readonly default: Icon };
  export default imported;
}
