import {Filters} from "./components/filters";
import {useMemo} from "react";
import {makeSelectFullProjectPool} from "../../redux/operatorSlice";
import {useSelector} from "react-redux";


export const ManagerPanel = () => {


    return(
        <div className="card col ml-0">
            <div className="card-body">
                <Filters />
            </div>
        </div>
    )
}
